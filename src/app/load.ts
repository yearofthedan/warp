import { pluginRules, registry } from '../rules/registry.ts';
import { ConfigError } from '../model/configError.ts';
import { type Rule, noOptions } from '../rules/rule.ts';
import type { ArchetypeData, ConfigData } from '../model/archetype/data.ts';
import { parseStructure } from '../model/archetype/language.ts';
import { type Check, checkReferences, toRules } from '../model/archetype/references.ts';
import { checkInputs, markTests } from '../model/archetype/requirements.ts';
import { unclassified } from './unclassified.ts';
import { withRuleset } from '../model/archetype/rulesets.ts';
import { defined, type Fail, isName, isRecord } from '../model/archetype/shared.ts';

export interface LoadedConfigData {
  config: ConfigData;
  rules: Rule[];
}

export interface LoadOptions {
  builtins?: readonly Rule[];
  ruleset?: string;
  file?: string;
  plugins?: Record<string, unknown>;
}

const keys = ['root', 'archetypes', 'rulesets', 'plugins', 'tsconfig'];

export const loadConfigData = (
  raw: unknown,
  { builtins, ruleset, file = 'warp.yaml', plugins = {} }: LoadOptions = {},
): LoadedConfigData => {
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
  const rules = [...registry([...(builtins ?? []), ...pluginRules(plugins)]).values()];
  const structure = parseStructure(raw.root, raw.archetypes, fail);
  failed();
  checkReferences(structure.archetypes, structure.pending, fail);
  markTests(structure.archetypes, fail);
  checkInputs(structure.archetypes, structure.pending, fail);
  const check: Check = {
    fail,
    ruleIds: builtins && new Set([...rules.map((rule) => rule.id), unclassified]),
    options: Object.fromEntries(rules.map((rule) => [rule.id, rule.parseOptions ?? noOptions])),
  };
  const data: ConfigData = {
    file,
    root: structure.root,
    archetypes: Object.fromEntries(
      Object.entries(structure.archetypes).map(([name, archetype]) => [name, archetypeData(archetype)]),
    ),
    tsconfig: tsconfigs(raw.tsconfig, fail),
  };
  const config = withRuleset(data, raw.rulesets, ruleset, (value, at) => toRules(check, value, at), fail);
  failed();
  return { config, rules };
};

const archetypeData = (archetype: ArchetypeData): ArchetypeData =>
  defined({ ...archetype, modules: archetype.modules.map(defined) });

const checkPlugins = (declared: unknown, loaded: Record<string, unknown>, fail: Fail) => {
  if (declared === undefined) return;
  if (!isRecord(declared) || !Object.values(declared).every(isName)) {
    fail('plugins: expected plugin paths by namespace, { wt: ./rules/wt.ts }');
    return;
  }
  for (const namespace of Object.keys(declared).filter((namespace) => !Object.hasOwn(loaded, namespace)))
    fail(`plugins.${namespace}: not loaded; warp loads each plugin from its path before reading the config`);
};

const tsconfigs = (value: unknown, fail: Fail): string[] => {
  const paths = [value ?? 'tsconfig.json'].flat();
  if (paths.length === 0 || !paths.every(isName)) fail('tsconfig: expected a path or a list of paths');
  return paths as string[];
};
