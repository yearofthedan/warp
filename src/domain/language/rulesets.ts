import type { RuleSettingsData } from '../model/data.ts';
import { merged } from '../model/settings.ts';
import { type Fail, isRecord, list } from '../model/shared.ts';

export type ParseRules = (value: unknown, at: string) => RuleSettingsData | undefined;

export type ParseRuleset = (value: unknown, at: string) => RuleSettingsData | undefined;

export interface Rulesets {
  parse: ParseRuleset;
  checkUsed(): void;
}

export const recommended = 'warp:recommended';

const rulesetKeys = ['extends', 'rules'];

interface Named {
  local: ReadonlyMap<string, unknown>;
  shared: Readonly<Record<string, unknown>>;
  parseRules: ParseRules;
  fail: Fail;
  extended: Set<string>;
}

export const rulesets = (
  named: unknown,
  shared: Readonly<Record<string, unknown>>,
  parseRules: ParseRules,
  fail: Fail,
): Rulesets => {
  const state: Named = {
    local: localRulesets(named, fail),
    shared,
    parseRules,
    fail,
    extended: new Set(),
  };
  return {
    parse: (value, at) => (value === undefined ? undefined : flatten(state, value, at, [])),
    checkUsed: () => {
      for (const name of [...state.local.keys()].filter((name) => !state.extended.has(name)))
        fail(`rulesets.${name}: nothing extends it; a named ruleset applies through a ruleset's extends`);
    },
  };
};

const localRulesets = (value: unknown, fail: Fail): Map<string, unknown> => {
  if (value === undefined) return new Map();
  if (!isRecord(value)) {
    fail('rulesets: expected rulesets by name, { strict: { rules: {...} } }');
    return new Map();
  }
  for (const name of Object.keys(value).filter((name) => name.includes(':')))
    fail(`rulesets.${name}: a name has no ':', which marks a plugin's ruleset`);
  return new Map(Object.entries(value).filter(([name]) => !name.includes(':')));
};

const flatten = (state: Named, def: unknown, at: string, seen: readonly string[]): RuleSettingsData => {
  if (!isRecord(def)) {
    state.fail(`${at}: expected a ruleset, { extends: [${recommended}], rules: {...} }`);
    return {};
  }
  for (const key of Object.keys(def).filter((key) => !rulesetKeys.includes(key)))
    state.fail(`${at}: unknown key ${key}; a ruleset takes ${rulesetKeys.join(', ')}`);
  const bases = [def.extends ?? []].flat().map((base) => baseOf(state, base, `${at}.extends`, seen));
  const own = state.parseRules(def.rules, `${at}.rules`);
  return [...bases, own].reduce(merged, {});
};

const baseOf = (state: Named, base: unknown, at: string, seen: readonly string[]): RuleSettingsData | undefined => {
  const local = typeof base === 'string' && state.local.has(base);
  if (typeof base !== 'string' || !(local || Object.hasOwn(state.shared, base))) {
    const known = [...Object.keys(state.shared), ...state.local.keys()];
    state.fail(`${at}: '${String(base)}' is no ruleset; extend ${list(known, 'nothing')}`);
    return undefined;
  }
  if (seen.includes(base)) {
    state.fail(`${at}: ${[...seen, base].join(' extends ')}, a loop`);
    return undefined;
  }
  state.extended.add(base);
  return resolveNamed(state, base, local, seen);
};

const resolveNamed = (state: Named, name: string, local: boolean, seen: readonly string[]): RuleSettingsData => {
  const def = local ? state.local.get(name) : state.shared[name];
  return flatten(state, def, local ? `rulesets.${name}` : name, [...seen, name]);
};
