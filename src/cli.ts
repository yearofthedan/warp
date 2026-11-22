#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { diskFolders } from './analysis/folders.ts';
import { typescriptAnalyzer } from './analysis/typescript.ts';
import { modelProject, type ProjectCheck, projectCheck } from './app/check.ts';
import { diffProject, parseRange } from './app/diff.ts';
import { builtinRegistry, unclassifiedDocs } from './builtins.ts';
import { findConfig, loadConfig } from './config/loadConfig.ts';
import { toolDigest } from './config/toolDigest.ts';
import { gitDirCache } from './git/cache.ts';
import { gitRepository, projectPathOf } from './git/repository.ts';
import type { ConfigData } from './model/archetype/data.ts';
import { rulesOf } from './model/archetype/settings.ts';
import { loadConfigData } from './model/archetype/load.ts';
import { ConfigError, type Rule } from './model/rule.ts';
import { reporters } from './reporters/index.ts';
import { modelJson, modelText } from './reporters/model.ts';
import { actionable, type Report } from './reporters/reporter.ts';

const usage = `usage:
  warp check [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  warp diff <base>[..<head> | ...<head>] [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  warp model [--config <file>] [--ruleset <name>] [--rules] [--json]

check   reports every finding in the working tree.
diff    reports findings that are new or worse at <head> than at <base>. Without <head>, compares the working tree.
        <base>...<head> compares from where <head> left <base>, as git does.
model   prints the units the config finds, and which part each file is in.

--config    path to the config file (default: the first of warp.config.ts, .mts, .js, .mjs)
--ruleset   one of the config's rulesets (default: the one named default, if any)
--reporter  ${[...reporters.keys()].join(', ')} (default: text)
--fail      exit 1 when there are findings (check) or new or worse findings (diff)
--rules     with model, list each unit's and part's rule settings that differ from the defaults
--json      print the model as JSON, with every unit's and part's resolved rule settings`;

type Options = { config?: string; ruleset?: string; reporter: string; fail: boolean };
type Produce = (root: string, project: ProjectCheck, digest: string) => Report;

interface Resolved {
  root: string;
  config: ConfigData;
  rules: Rule[];
  digest: string;
}

const adapters = { analyzer: typescriptAnalyzer, foldersAt: diskFolders };

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
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) return help(0);
  if (command === 'check' && args.length === 0)
    return run(values, (root, project) => ({ mode: 'check', findings: project.check(root) }));
  if (command === 'diff' && args.length === 1)
    return run(values, (root, project, digest) => ({ mode: 'diff', delta: delta(args[0], root, project, digest) }));
  if (command === 'model' && args.length === 0) return printModel(values);
  return help(2);
};

const help = (code: number): number => {
  (code === 0 ? console.log : console.error)(usage);
  return code;
};

const resolveConfig = async (options: Omit<Options, 'reporter' | 'fail'>): Promise<Resolved> => {
  const configFile = realpathSync(options.config ? resolve(options.config) : findConfig(process.cwd()));
  const root = dirname(configFile);
  const { raw, digest } = await loadConfig(configFile);
  const builtins = [...builtinRegistry.values()];
  const { config, rules, warnings } = loadConfigData(raw, { builtins, ruleset: options.ruleset });
  for (const warning of warnings) console.error(`warp config: ${warning}`);
  return { root, config, rules, digest };
};

const checkOf = ({ config, rules }: Resolved): ProjectCheck =>
  projectCheck(adapters, config, { rules, unclassifiedDocs });

const run = async (options: Options, produce: Produce): Promise<number> => {
  const reporter = reporters.get(options.reporter);
  if (!reporter)
    throw new Error(`no reporter called ${options.reporter}: use one of ${[...reporters.keys()].join(', ')}`);
  try {
    const resolved = await resolveConfig(options);
    const report = produce(resolved.root, checkOf(resolved), resolved.digest);
    const output = reporter.render(report, { toolVersion: version(), projectPath: projectPathOf(resolved.root) });
    if (output) console.log(output);
    return options.fail && actionable(report).length > 0 ? 1 : 0;
  } catch (error) {
    return failed(error, reporter.failureExitCode);
  }
};

type ModelOptions = Omit<Options, 'reporter' | 'fail'> & { json: boolean; rules: boolean };

const printModel = async (options: ModelOptions): Promise<number> => {
  try {
    const { root, config, rules } = await resolveConfig(options);
    const { model } = modelProject(adapters, root, config);
    const settings = rulesOf(config, model, rules);
    console.log(options.json ? modelJson(model, settings) : modelText(model, options.rules ? settings : undefined));
    return 0;
  } catch (error) {
    return failed(error);
  }
};

const delta = (range: string, root: string, project: ProjectCheck, configDigest: string) =>
  diffProject(
    { range: parseRange(range), root, project, configDigest, toolDigest: toolDigest() },
    { repository: gitRepository(root), cache: gitDirCache(root) },
  );

const version = (): string => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const failed = (error: unknown, exitCode = 2): number => {
  console.error(
    error instanceof ConfigError ? `warp config: ${error.message}` : error instanceof Error ? error.message : error,
  );
  return exitCode;
};

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.exitCode = failed(error);
}
