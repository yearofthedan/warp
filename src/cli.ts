#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { diskFolders } from './adapters/analysis/folders.ts';
import { typescriptAnalyzer } from './adapters/analysis/typescript.ts';
import { type Adapters, modelProject, type ProjectCheck, projectCheck } from './app/check.ts';
import { type ConfigLines, placeProblems } from './app/configLines.ts';
import { factsStore } from './adapters/git/factsStore.ts';
import { failures } from './app/failures.ts';
import { diffProject, parseRange } from './app/diff.ts';
import { warp } from './builtins/index.ts';
import { findConfig, yamlConfig } from './adapters/config/loadConfig.ts';
import { toolDigest } from './adapters/git/toolDigest.ts';
import { gitDirCache } from './adapters/git/cache.ts';
import { gitRepository, projectPathOf } from './adapters/git/repository.ts';
import type { ConfigData } from './domain/model/data.ts';
import { anyRuleOn, rulesOf } from './domain/model/settings.ts';
import { recommended } from './domain/language/compile.ts';
import { loadConfig } from './app/load.ts';
import { ConfigError } from './domain/model/configError.ts';
import type { Rule } from './domain/rules/rule.ts';
import { reporters } from './adapters/reporters/index.ts';
import { modelJson, modelText } from './adapters/reporters/model.ts';
import { actionable, type Report } from './adapters/reporters/reporter.ts';

const usage = `usage:
  warp check [--config <file>] [--reporter <name>] [--fail]
  warp diff <base>[..<head> | ...<head>] [--since-last-run] [--config <file>] [--reporter <name>] [--fail]
  warp model [--config <file>] [--rules] [--json]

check   reports every finding in the working tree.
diff    reports findings that are new or worse at <head> than at <base>. Without <head>, compares the working tree.
        <base>...<head> compares from where <head> left <base>, as git does.
        With --since-last-run, compares the working tree with the last such run, or with <base> if there is none.
model   prints the modules the config finds, and which module each file is in.

--config          path to the config file (default: warp.yaml)
--reporter        ${[...reporters.keys()].join(', ')} (default: text)
--since-last-run  with diff, compare with the last diff run that had this flag
--fail            exit 1 when there are findings (check) or new or worse findings (diff)
--rules           with model, list each module's rule settings that differ from the defaults
--json            print the model as JSON, with every module's resolved rule settings`;

type Options = { config?: string; reporter: string; fail: boolean; 'since-last-run': boolean };
type Produce = (root: string, project: ProjectCheck, digest: string) => Report;

interface Resolved {
  root: string;
  config: ConfigData;
  rules: Rule[];
  lines: ConfigLines;
  digest: string;
}

let toolHash: string | undefined;
const tool = (): string => (toolHash ??= toolDigest());

const adaptersAt = (root: string): Adapters => {
  const adapters = { analyzer: typescriptAnalyzer, foldersAt: diskFolders };
  try {
    return { ...adapters, facts: factsStore(gitDirCache(root), tool(), gitRepository(root).projectPath()) };
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
  const source = yamlConfig(configFile);
  const loaded = await loadConfig(source, { builtins: warp });
  for (const tsconfig of loaded.config.tsconfig.filter((path) => !existsSync(join(root, path))))
    throw new ConfigError(
      placeProblems(
        loaded.lines,
        source.file,
        `tsconfig: no ${tsconfig} beside ${source.file}; add it, or list the project's tsconfig files under tsconfig`,
      ),
    );
  return { root, ...loaded };
};

const checkOf = ({ root, config, rules, lines }: Resolved): ProjectCheck =>
  projectCheck(adaptersAt(root), config, { rules, lines });

const run = async (options: Options, produce: Produce): Promise<number> => {
  const reporter = reporters.get(options.reporter);
  if (!reporter)
    throw new Error(`no reporter called ${options.reporter}: use one of ${[...reporters.keys()].join(', ')}`);
  try {
    const resolved = await resolveConfig(options);
    if (!anyRuleOn(resolved.config)) console.error(nothingOn(resolved.config.file));
    const report = placed(resolved, () => produce(resolved.root, checkOf(resolved), resolved.digest));
    const output = reporter.render(report, { toolVersion: version(), projectPath: projectPathOf(resolved.root) });
    if (output) console.log(output);
    if (reporter.renderFailure) lastFailure().forget();
    return options.fail && actionable(report).length > 0 ? 1 : 0;
  } catch (error) {
    const code = failed(error, reporter.failureExitCode);
    const problem = describe(error);
    if (!reporter.renderFailure || !lastFailure().isNew(problem)) return code;
    console.log(reporter.renderFailure(problem));
    return 0;
  }
};

const placed = <T>({ lines, config }: Resolved, run: () => T): T => {
  try {
    return run();
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigError(placeProblems(lines, config.file, error.message));
    throw error;
  }
};

const nothingOn = (file: string) =>
  `No rules are on, so nothing was checked. Turn some on in ${file}: root: { ruleset: [${recommended}] }`;

const failureCache = () => {
  try {
    return gitDirCache<string>(process.cwd());
  } catch {
    return undefined;
  }
};

const lastFailure = () => failures(failureCache(), tool());

type ModelOptions = Omit<Options, 'reporter' | 'fail' | 'since-last-run'> & { json: boolean; rules: boolean };

const printModel = async (options: ModelOptions): Promise<number> => {
  try {
    const resolved = await resolveConfig(options);
    const { root, config, rules } = resolved;
    const { model } = placed(resolved, () => modelProject(adaptersAt(root), root, config));
    const settings = rulesOf(config, model, rules);
    console.log(options.json ? modelJson(model, settings) : modelText(model, options.rules ? settings : undefined));
    return 0;
  } catch (error) {
    return failed(error);
  }
};

const delta = (range: string, root: string, project: ProjectCheck, configDigest: string, sinceLastRun: boolean) =>
  diffProject(
    { range: parseRange(range), root, project, configDigest, toolDigest: tool(), sinceLastRun },
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
