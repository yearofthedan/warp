import { ConfigError } from '../errors/configError.ts';
import type { ArchetypeData, ConfigData } from '../model/data.ts';
import { defined, type Fail, isName, isRecord } from '../model/shared.ts';
import { type Check, checkReferences, toRules } from './references.ts';
import { checkInputs, markTests } from './requirements.ts';
import { rulesets as namedRulesets } from './rulesets.ts';
import { parseStructure } from './structure.ts';

export { recommended } from './rulesets.ts';

export interface CompileOptions {
  file?: string;
  plugins?: readonly string[];
  rulesets?: Readonly<Record<string, unknown>>;
  ruleIds?: ReadonlySet<string> | undefined;
  options?: Check['options'];
  moduleOptions?: Check['moduleOptions'];
}

const keys = ['root', 'archetypes', 'rulesets', 'plugins', 'tsconfig'];

export const compileConfig = (
  raw: unknown,
  { file = 'warp.yaml', plugins = [], rulesets = {}, ruleIds, options = {}, moduleOptions = {} }: CompileOptions = {},
): ConfigData => {
  const errors: string[] = [];
  const fail: Fail = (message) => {
    if (!errors.includes(message)) errors.push(message);
  };
  const failed = () => {
    if (errors.length > 0) throw new ConfigError(errors.join('\n'));
  };
  if (!isRecord(raw)) throw new ConfigError(`${file}: expected a mapping, root: { modules: ... }`);
  const unknownKeys = Object.keys(raw).filter((key) => !keys.includes(key));
  for (const key of unknownKeys) fail(`${key}: unknown key; a config takes ${keys.join(', ')}`);
  checkPlugins(raw.plugins, plugins, fail);
  const check: Check = { fail, ruleIds, options, moduleOptions };
  const named = namedRulesets(raw.rulesets, rulesets, (value, at, names) => toRules(check, value, at, names), fail);
  const structure = parseStructure(raw.root, raw.archetypes, fail, named.parse);
  named.checkUsed();
  failed();
  checkReferences(structure.archetypes, structure.pending, fail);
  markTests(structure.archetypes, fail);
  checkInputs(structure.archetypes, structure.pending, fail);
  const config: ConfigData = {
    file,
    root: structure.root,
    archetypes: Object.fromEntries(
      Object.entries(structure.archetypes).map(([name, archetype]) => [name, archetypeData(archetype)]),
    ),
    tsconfig: tsconfigs(raw.tsconfig, fail),
  };
  failed();
  return config;
};

const archetypeData = (archetype: ArchetypeData): ArchetypeData =>
  defined({ ...archetype, modules: archetype.modules.map(defined) });

const checkPlugins = (declared: unknown, loaded: readonly string[], fail: Fail) => {
  if (declared === undefined) return;
  if (!isRecord(declared) || !Object.values(declared).every(isName)) {
    fail('plugins: expected plugin paths by namespace, { wt: ./rules/wt.ts }');
    return;
  }
  for (const namespace of Object.keys(declared).filter((namespace) => !loaded.includes(namespace)))
    fail(`plugins.${namespace}: not loaded; warp loads each plugin from its path before reading the config`);
};

const tsconfigs = (value: unknown, fail: Fail): string[] => {
  const paths = [value ?? 'tsconfig.json'].flat();
  if (paths.length === 0 || !paths.every(isName)) fail('tsconfig: expected a path or a list of paths');
  return paths as string[];
};
