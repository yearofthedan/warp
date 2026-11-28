import type { RefData, RuleSettingsData, RulesetData } from '../model/data.ts';
import { type Fail, isRecord, list } from '../model/shared.ts';

export type Names = (entry: string, where: string) => RefData | undefined;

export type ParseRules = (value: unknown, at: string, names?: Names) => RuleSettingsData | undefined;

export type ParseRuleset = (value: unknown, at: string, names?: Names) => RulesetData | undefined;

export interface Rulesets {
  parse: ParseRuleset;
  checkUsed(): void;
}

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
    parse: (value, at, names) => (value === undefined ? undefined : flatten(state, value, at, [], names)),
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

const flatten = (state: Named, value: unknown, at: string, seen: readonly string[], names?: Names): RulesetData => {
  const def = Array.isArray(value) ? { extends: value } : value === 'off' ? { rules: 'off' } : value;
  if (!isRecord(def)) {
    state.fail(`${at}: expected a ruleset, off, [warp:boundaries] or { extends: [warp:boundaries], rules: {...} }`);
    return [];
  }
  for (const key of Object.keys(def).filter((key) => !rulesetKeys.includes(key)))
    state.fail(`${at}: unknown key ${key}; a ruleset takes ${rulesetKeys.join(', ')}`);
  const bases = [def.extends ?? []].flat().flatMap((base) => baseOf(state, base, `${at}.extends`, seen));
  const own = state.parseRules(def.rules, `${at}.rules`, names);
  return own ? [...bases, own] : bases;
};

const baseOf = (state: Named, base: unknown, at: string, seen: readonly string[]): RulesetData => {
  const local = typeof base === 'string' && state.local.has(base);
  if (typeof base !== 'string' || !(local || Object.hasOwn(state.shared, base))) {
    const known = [...Object.keys(state.shared), ...state.local.keys()];
    state.fail(`${at}: '${String(base)}' is no ruleset; extend ${list(known, 'nothing')}`);
    return [];
  }
  if (seen.includes(base)) {
    state.fail(`${at}: ${[...seen, base].join(' extends ')}, a loop`);
    return [];
  }
  state.extended.add(base);
  return resolveNamed(state, base, local, seen);
};

const resolveNamed = (state: Named, name: string, local: boolean, seen: readonly string[]): RulesetData => {
  const def = local ? state.local.get(name) : state.shared[name];
  return flatten(state, def, local ? `rulesets.${name}` : name, [...seen, name]);
};
