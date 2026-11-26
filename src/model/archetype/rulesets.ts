import { ConfigError } from '../configError.ts';
import { type ArchetypeData, type ConfigData, isTestData, type RuleSettingsData } from './data.ts';
import { type Fail, isRecord, list } from './shared.ts';

export type ParseRules = (value: unknown, at: string) => RuleSettingsData | undefined;

interface Target {
  archetype: string;
  module?: string;
}

interface Layer {
  target?: Target;
  settings: unknown;
  at: string;
}

export const withRuleset = (
  config: ConfigData,
  rulesets: unknown,
  name: string | undefined,
  parse: ParseRules,
  fail: Fail,
): ConfigData => {
  const named = rulesetsOf(rulesets, fail);
  if (name !== undefined && !named.has(name)) {
    const names = [...named.keys()];
    throw new ConfigError(
      `rulesets: no ruleset called ${name}. ${names.length > 0 ? `Rulesets: ${names.join(', ')}` : 'The config declares none'}`,
    );
  }
  const chosen = name ?? 'default';
  if (!named.has(chosen)) return applied(config, [{ settings: 'off', at: 'rulesets' }], parse, fail);
  const { layers, recommends } = layersOf(config, chosen, named, fail);
  const base: Layer[] = recommends ? [] : [{ settings: 'off', at: `rulesets.${chosen}` }];
  return applied(config, [...base, ...layers], parse, fail);
};

export const recommended = 'warp:recommended';

const rulesetKeys = ['extends', 'rules', 'test', 'on'];

const rulesetsOf = (value: unknown, fail: Fail): Map<string, Record<string, unknown>> => {
  const named = new Map<string, Record<string, unknown>>();
  if (value === undefined) return named;
  if (!isRecord(value)) {
    fail('rulesets: expected rulesets by name, { default: { extends: [warp:recommended] } }');
    return named;
  }
  for (const [name, ruleset] of Object.entries(value)) {
    if (!isRecord(ruleset)) {
      fail(`rulesets.${name}: expected a ruleset, { extends: [warp:recommended], rules: {...} }`);
      continue;
    }
    for (const key of Object.keys(ruleset).filter((key) => !rulesetKeys.includes(key)))
      fail(`rulesets.${name}: unknown key ${key}; a ruleset takes ${rulesetKeys.join(', ')}`);
    named.set(name, ruleset);
  }
  return named;
};

interface Layers {
  layers: Layer[];
  recommends: boolean;
}

const layersOf = (
  config: ConfigData,
  name: string,
  named: Map<string, Record<string, unknown>>,
  fail: Fail,
  seen: readonly string[] = [],
): Layers => {
  const ruleset = named.get(name)!;
  const at = `rulesets.${name}`;
  const inherited = basesOf(config, name, named, fail, seen);
  const layers = [...inherited.layers];
  if (ruleset.rules !== undefined) layers.push({ settings: ruleset.rules, at: `${at}.rules` });
  if (ruleset.test !== undefined)
    for (const target of testTargets(config)) layers.push({ target, settings: ruleset.test, at: `${at}.test` });
  if (ruleset.on !== undefined) layers.push(...onLayers(config, at, ruleset.on, fail));
  return { layers, recommends: inherited.recommends };
};

const basesOf = (
  config: ConfigData,
  name: string,
  named: Map<string, Record<string, unknown>>,
  fail: Fail,
  seen: readonly string[],
): Layers => {
  const at = `rulesets.${name}`;
  const declared = named.get(name)!.extends;
  const bases = declared === undefined ? [] : [declared].flat();
  const found: Layers = { layers: [], recommends: false };
  for (const base of bases) {
    if (base === recommended) found.recommends = true;
    else if (typeof base !== 'string' || !named.has(base))
      fail(`${at}.extends: '${String(base)}' is no ruleset; extend ${list([recommended, ...named.keys()], 'nothing')}`);
    else if (seen.includes(base)) fail(`${at}.extends: ${[...seen, name, base].join(' extends ')}, a loop`);
    else {
      const extended = layersOf(config, base, named, fail, [...seen, name]);
      found.layers.push(...extended.layers);
      found.recommends ||= extended.recommends;
    }
  }
  return found;
};

const onLayers = (config: ConfigData, at: string, on: unknown, fail: Fail): Layer[] => {
  if (!isRecord(on)) {
    fail(`${at}.on: expected settings by archetype or module, { app.adapters: {...} }`);
    return [];
  }
  return Object.entries(on).flatMap(([path, settings]) => {
    const target = targetOf(config, path);
    if (target) return [{ target, settings, at: `${at}.on.${path}` }];
    fail(`${at}.on.${path}: no archetype or module called ${path}; name an archetype, or archetype.module`);
    return [];
  });
};

const testTargets = (config: ConfigData): Target[] =>
  Object.values(config.archetypes).flatMap((archetype) =>
    archetype.modules.filter(isTestData).map((module) => ({ archetype: archetype.name, module: module.name })),
  );

const targetOf = (config: ConfigData, path: string): Target | undefined => {
  if (config.archetypes[path]) return { archetype: path };
  for (let at = path.lastIndexOf('.'); at > 0; at = path.lastIndexOf('.', at - 1)) {
    const archetype = config.archetypes[path.slice(0, at)];
    const module = path.slice(at + 1);
    if (archetype?.modules.some((declared) => declared.name === module)) return { archetype: archetype.name, module };
  }
  return undefined;
};

const applied = (config: ConfigData, layers: readonly Layer[], parse: ParseRules, fail: Fail): ConfigData => {
  let rules = config.rules;
  const archetypes = Object.fromEntries(
    Object.entries(config.archetypes).map(([name, data]) => [name, { ...data, modules: [...data.modules] }]),
  );
  for (const { target, settings, at } of layers) {
    const layer = parse(settings, at);
    if (!target) {
      rules = merged(rules, layer);
      continue;
    }
    const archetype = archetypes[target.archetype];
    if (!archetype) {
      fail(`${at}: ${target.archetype} is not in the config`);
      continue;
    }
    applyTo(archetype, target.module, layer, at, fail);
  }
  return rules === undefined ? { ...config, archetypes } : { ...config, archetypes, rules };
};

const applyTo = (
  archetype: ArchetypeData,
  module: string | undefined,
  layer: RuleSettingsData | undefined,
  at: string,
  fail: Fail,
): void => {
  if (module === undefined) {
    archetype.rules = merged(archetype.rules, layer);
    return;
  }
  const index = archetype.modules.findIndex((declared) => declared.name === module);
  if (index < 0)
    fail(
      `${at}: ${archetype.name} has modules ${list(
        archetype.modules.map((declared) => declared.name),
        'none',
      )}`,
    );
  else
    archetype.modules[index] = { ...archetype.modules[index]!, rules: merged(archetype.modules[index]!.rules, layer) };
};

const merged = (
  base: RuleSettingsData | undefined,
  layer: RuleSettingsData | undefined,
): RuleSettingsData | undefined => {
  if (layer === undefined) return base;
  if (layer === 'off') return 'off';
  const result: Record<string, boolean | Record<string, unknown>> = base === 'off' ? { '*': false } : { ...base };
  for (const [id, setting] of Object.entries(layer)) {
    const was = result[id];
    if (setting === true && isRecord(was)) continue;
    result[id] = isRecord(setting) && isRecord(was) ? { ...was, ...setting } : setting;
  }
  return result;
};
