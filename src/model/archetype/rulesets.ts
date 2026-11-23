import { ConfigError } from '../configError.ts';
import { type RecordedRuleset, recordedAs } from './builder.ts';
import type { ConfigData, RuleSettingsData } from './data.ts';
import { type Fail, isName, isRecord, list } from './shared.ts';

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
      `no ruleset called ${name}. ${names.length > 0 ? `Rulesets: ${names.join(', ')}` : 'The config declares none'}`,
    );
  }
  const chosen = named.get(name ?? 'default');
  return chosen ? applied(config, layersOf(chosen, named, fail), parse, fail) : config;
};

const rulesetsOf = (value: unknown, fail: Fail): Map<string, RecordedRuleset> => {
  const named = new Map<string, RecordedRuleset>();
  if (value === undefined) return named;
  if (!isRecord(value)) {
    fail('config.rulesets: expected rulesets by name, { default: base, edit }');
    return named;
  }
  for (const [name, ruleset] of Object.entries(value)) {
    const recorded = recordedAs(ruleset, 'ruleset');
    if (recorded) named.set(name, recorded);
    else fail(`config.rulesets.${name}: expected a ruleset, ruleset().rules(...)`);
  }
  return named;
};

const layersOf = (ruleset: RecordedRuleset, named: Map<string, RecordedRuleset>, fail: Fail): Layer[] => {
  const label = (of: RecordedRuleset) => [...named].find(([, candidate]) => candidate === of)?.[0] ?? 'extends';
  const chain: RecordedRuleset[] = [];
  for (let current: RecordedRuleset | undefined = ruleset; current;) {
    chain.unshift(current);
    if (current.base === undefined) break;
    const base: RecordedRuleset | undefined = recordedAs(current.base, 'ruleset');
    if (!base) fail(`rulesets.${label(current)}.extends: expected a ruleset`);
    current = base;
  }
  return chain.flatMap((of) => {
    const at = `rulesets.${label(of)}`;
    return of.entries.map(({ target, settings }): Layer => {
      if (target === undefined) return { settings, at: `${at}.rules` };
      const resolved = targetOf(target);
      if (!resolved) {
        fail(`${at}.on: expected an archetype or one of its modules, such as component or component.modules.logic`);
        return { settings: undefined, at };
      }
      const shown =
        resolved.module === undefined
          ? resolved.archetype
          : `${resolved.archetype.replaceAll('.', '.modules.')}.modules.${resolved.module}`;
      return { target: resolved, settings, at: `${at}.on(${shown})` };
    });
  });
};

const targetOf = (value: unknown): Target | undefined => {
  const archetype = recordedAs(value, 'archetype');
  if (archetype) return isName(archetype.definition.name) ? { archetype: archetype.definition.name } : undefined;
  const handle = recordedAs(value, 'handle');
  return handle && { archetype: handle.archetype as string, module: handle.module as string };
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
    if (target.module === undefined) {
      archetype.rules = merged(archetype.rules, layer);
      continue;
    }
    const index = archetype.modules.findIndex((module) => module.name === target.module);
    const names = archetype.modules.map((module) => module.name);
    if (index < 0) fail(`${at}: ${archetype.name} has modules ${list(names, 'none')}`);
    else
      archetype.modules[index] = {
        ...archetype.modules[index]!,
        rules: merged(archetype.modules[index]!.rules, layer),
      };
  }
  return rules === undefined ? { ...config, archetypes } : { ...config, archetypes, rules };
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
