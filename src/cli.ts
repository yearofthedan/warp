#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { diskFolders } from './analysis/folders.ts';
import { typescriptAnalyzer } from './analysis/typescript.ts';
import { archetypeCheck, kindsCheck, modelProject, type ProjectCheck } from './app/check.ts';
import { diffProject, parseRange } from './app/diff.ts';
import { archetypeDocs, builtinRegistry, unclassifiedDocs } from './builtins.ts';
import { findConfig, loadConfig } from './config/loadConfig.ts';
import { toolDigest } from './config/toolDigest.ts';
import { gitDirCache } from './git/cache.ts';
import { gitRepository, projectPathOf } from './git/repository.ts';
import type { ConfigData } from './model/archetype/data.ts';
import { loadConfigData } from './model/archetype/load.ts';
import { modelRules } from './model/archetype/rules.ts';
import { type Config, parseConfig } from './model/config.ts';
import { ConfigError } from './model/rule.ts';
import { reporters } from './reporters/index.ts';
import { modelJson, modelText } from './reporters/model.ts';
import { actionable, type Report } from './reporters/reporter.ts';

const usage = `usage:
  warp check [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  warp diff <base>[..<head> | ...<head>] [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  warp model [--config <file>] [--json]
  warp --print-config [--config <file>] [--ruleset <name>]

check   reports every finding in the working tree.
diff    reports findings that are new or worse at <head> than at <base>. Without <head>, compares the working tree.
        <base>...<head> compares from where <head> left <base>, as git does.
model   prints the units an archetype config finds, and which part each file is in.

--config    path to the config file (default: the first of warp.config.ts, .mts, .js, .mjs, .json)
--ruleset   a named export of the config: [config, ...overlays] merged in order (default: the default export)
--print-config  print the config as resolved, with each kind's rules and options, and exit
--reporter  ${[...reporters.keys()].join(', ')} (default: text)
--fail      exit 1 when there are findings (check) or new or worse findings (diff)
--json      print the model as JSON`;

type Options = { config?: string; ruleset?: string; reporter: string; fail: boolean };
type Produce = (root: string, project: ProjectCheck, digest: string) => Report;

type Resolved =
  | { shape: 'kinds'; root: string; config: Config; digest: string }
  | { shape: 'archetypes'; root: string; config: ConfigData; digest: string };

const adapters = { analyzer: typescriptAnalyzer, foldersAt: diskFolders };

const main = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      ruleset: { type: 'string' },
      'print-config': { type: 'boolean', default: false },
      reporter: { type: 'string', default: 'text' },
      fail: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) return help(0);
  if (values['print-config'] && positionals.length === 0) return printConfig(values);
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
  const { raw, digest } = await loadConfig(configFile, options.ruleset);
  try {
    if (!isArchetypeConfig(raw)) {
      return { shape: 'kinds', root, config: parseConfig(raw, builtinRegistry, { unclassifiedDocs }), digest };
    }
    const { config, warnings } = loadConfigData(raw, { ruleIds: Object.keys(modelRules), options: modelRules });
    for (const warning of warnings) console.error(`warp config: ${warning}`);
    return { shape: 'archetypes', root, config, digest };
  } catch (error) {
    if (error instanceof ConfigError && options.ruleset !== undefined)
      throw new ConfigError(`ruleset ${options.ruleset}: ${error.message}`);
    throw error;
  }
};

const isArchetypeConfig = (raw: unknown): boolean => typeof raw === 'object' && raw !== null && 'root' in raw;

const projectCheck = (resolved: Resolved): ProjectCheck =>
  resolved.shape === 'kinds'
    ? kindsCheck(typescriptAnalyzer, resolved.config)
    : archetypeCheck(adapters, resolved.config, archetypeDocs);

const run = async (options: Options, produce: Produce): Promise<number> => {
  const reporter = reporters.get(options.reporter);
  if (!reporter)
    throw new Error(`no reporter called ${options.reporter}: use one of ${[...reporters.keys()].join(', ')}`);
  try {
    const resolved = await resolveConfig(options);
    const report = produce(resolved.root, projectCheck(resolved), resolved.digest);
    const output = reporter.render(report, { toolVersion: version(), projectPath: projectPathOf(resolved.root) });
    if (output) console.log(output);
    return options.fail && actionable(report).length > 0 ? 1 : 0;
  } catch (error) {
    return failed(error, reporter.failureExitCode);
  }
};

const printConfig = async (options: Omit<Options, 'reporter' | 'fail'>): Promise<number> => {
  const resolved = await resolveConfig(options);
  if (resolved.shape === 'archetypes')
    throw new ConfigError('--print-config prints a kinds config; warp model shows what an archetype config finds');
  const { config } = resolved;
  const kinds = config.kinds.map((kind) => [
    kind.name,
    {
      match: kind.match,
      dependsOn: kind.dependsOn,
      rules: Object.fromEntries(kind.rules.map(({ rule, options }) => [rule.id, options])),
    },
  ]);
  console.log(
    JSON.stringify({ tsconfig: config.tsconfig, exclude: config.exclude, kinds: Object.fromEntries(kinds) }, null, 2),
  );
  return 0;
};

const printModel = async (options: Omit<Options, 'reporter' | 'fail'> & { json: boolean }): Promise<number> => {
  try {
    const resolved = await resolveConfig(options);
    if (resolved.shape === 'kinds')
      throw new ConfigError('warp model reads an archetype config, defineConfig({ root }); this one declares kinds');
    const { model } = modelProject(adapters, resolved.root, resolved.config);
    console.log(options.json ? modelJson(model) : modelText(model));
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
