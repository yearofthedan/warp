#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { diskFolders } from './analysis/folders.ts';
import { typescriptAnalyzer } from './analysis/typescript.ts';
import { type Adapters, modelProject, type ProjectCheck, projectCheck } from './app/check.ts';
import { type ConfigLines, placeProblems } from './app/configLines.ts';
import { factsStore } from './app/facts.ts';
import { diffProject, parseRange } from './app/diff.ts';
import { builtinRegistry, unclassifiedDocs } from './builtins/index.ts';
import { findConfig, loadConfig } from './config/loadConfig.ts';
import { toolDigest } from './config/toolDigest.ts';
import { gitDirCache } from './git/cache.ts';
import { gitRepository, projectPathOf } from './git/repository.ts';
import type { ConfigData } from './model/archetype/data.ts';
import { anyRuleOn, rulesOf } from './model/archetype/settings.ts';
import { recommended } from './model/archetype/rulesets.ts';
import { loadConfigData } from './app/load.ts';
import { ConfigError } from './model/configError.ts';
import type { Rule } from './rules/rule.ts';
import { reporters } from './reporters/index.ts';
import { modelJson, modelText } from './reporters/model.ts';
import { actionable, type Report } from './reporters/reporter.ts';

const usage = `usage:
  warp check [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  warp diff <base>[..<head> | ...<head>] [--since-last-run] [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  warp model [--config <file>] [--ruleset <name>] [--rules] [--json]

check   reports every finding in the working tree.
diff    reports findings that are new or worse at <head> than at <base>. Without <head>, compares the working tree.
        <base>...<head> compares from where <head> left <base>, as git does.
        With --since-last-run, compares the working tree with the last such run, or with <base> if there is none.
model   prints the modules the config finds, and which module each file is in.

--config          path to the config file (default: warp.yaml)
--ruleset         one of the config's rulesets (default: the one named default, if any)
--reporter        ${[...reporters.keys()].join(', ')} (default: text)
--since-last-run  with diff, compare with the last diff run that had this flag
--fail            exit 1 when there are findings (check) or new or worse findings (diff)
--rules           with model, list each module's rule settings that differ from the defaults
--json            print the model as JSON, with every module's resolved rule settings`;

type Options = { config?: string; ruleset?: string; reporter: string; fail: boolean; 'since-last-run': boolean };
type Produce = (root: string, project: ProjectCheck, digest: string) => Report;

interface Resolved {
  root: string;
  config: ConfigData;
  rules: Rule[];
  lines: ConfigLines;
  digest: string;
}

const adaptersAt = (root: string): Adapters => {
  const adapters = { analyzer: typescriptAnalyzer, foldersAt: diskFolders };
  try {
    return { ...adapters, facts: factsStore(gitDirCache(root), toolDigest(), gitRepository(root).projectPath()) };
  } catch {
    return adapters;
  }
};

const main = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      ruleset: { type: 'string' },
      rules: { type: 'boolean', default: false },
      reporter: { type: 'string', default: 'text' },
      fail: { type: 'boolean', default: false },
      'since-last-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) return help(0);
  if (command === 'check' && args.length === 0)
    return run(values, (root, project) => ({ mode: 'check', findings: project.check(root) }));
  if (command === 'diff' && args.length === 1)
    return run(values, (root, project, digest) => ({
      mode: 'diff',
      delta: delta(args[0], root, project, digest, values['since-last-run']),
    }));
  if (command === 'model' && args.length === 0) return printModel(values);
  return help(2);
};

const help = (code: number): number => {
  (code === 0 ? console.log : console.error)(usage);
  return code;
};

const resolveConfig = async (options: Omit<Options, 'reporter' | 'fail' | 'since-last-run'>): Promise<Resolved> => {
  const configFile = realpathSync(options.config ? resolve(options.config) : findConfig(process.cwd()));
  const root = dirname(configFile);
  const { raw, plugins, lines, digest } = await loadConfig(configFile);
  const builtins = [...builtinRegistry.values()];
  const file = basename(configFile);
  try {
    const { config, rules } = loadConfigData(raw, { builtins, plugins, ruleset: options.ruleset, file });
    return { root, config, rules, lines, digest };
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigError(placeProblems(lines, file, error.message));
    throw error;
  }
};

const checkOf = ({ root, config, rules, lines }: Resolved): ProjectCheck =>
  projectCheck(adaptersAt(root), config, { rules, unclassifiedDocs, lines });

const run = async (options: Options, produce: Produce): Promise<number> => {
  const reporter = reporters.get(options.reporter);
  if (!reporter)
    throw new Error(`no reporter called ${options.reporter}: use one of ${[...reporters.keys()].join(', ')}`);
  try {
    const resolved = await resolveConfig(options);
    if (!anyRuleOn(resolved.config)) console.error(nothingOn(resolved.config.file));
    const report = produce(resolved.root, checkOf(resolved), resolved.digest);
    const output = reporter.render(report, { toolVersion: version(), projectPath: projectPathOf(resolved.root) });
    if (output) console.log(output);
    if (reporter.renderFailure) forgetFailure();
    return options.fail && actionable(report).length > 0 ? 1 : 0;
  } catch (error) {
    const code = failed(error, reporter.failureExitCode);
    const problem = describe(error);
    if (!reporter.renderFailure || !isNewFailure(problem)) return code;
    console.log(reporter.renderFailure(problem));
    return 0;
  }
};

const nothingOn = (file: string) =>
  `No rules are on, so nothing was checked. Turn some on in ${file}: rulesets: { default: { extends: [${recommended}] } }`;

const failureKey = () => `${toolDigest()}-failure`;

const failureCache = () => {
  try {
    return gitDirCache<string>(process.cwd());
  } catch {
    return undefined;
  }
};

const isNewFailure = (problem: string): boolean => {
  const cache = failureCache();
  if (cache?.get(failureKey()) === problem) return false;
  cache?.set(failureKey(), problem);
  return true;
};

const forgetFailure = () => {
  const cache = failureCache();
  if (cache?.get(failureKey()) !== undefined) cache.prune((key) => key !== failureKey());
};

type ModelOptions = Omit<Options, 'reporter' | 'fail' | 'since-last-run'> & { json: boolean; rules: boolean };

const printModel = async (options: ModelOptions): Promise<number> => {
  try {
    const { root, config, rules } = await resolveConfig(options);
    const { model } = modelProject(adaptersAt(root), root, config);
    const settings = rulesOf(config, model, rules);
    console.log(options.json ? modelJson(model, settings) : modelText(model, options.rules ? settings : undefined));
    return 0;
  } catch (error) {
    return failed(error);
  }
};

const delta = (range: string, root: string, project: ProjectCheck, configDigest: string, sinceLastRun: boolean) =>
  diffProject(
    { range: parseRange(range), root, project, configDigest, toolDigest: toolDigest(), sinceLastRun },
    { repository: gitRepository(root), cache: gitDirCache(root) },
  );

const version = (): string => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const describe = (error: unknown): string =>
  error instanceof ConfigError
    ? `warp config: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);

const failed = (error: unknown, exitCode = 2): number => {
  console.error(describe(error));
  return exitCode;
};

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.exitCode = failed(error);
}
