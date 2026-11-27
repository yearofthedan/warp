import type { ArchetypeData, ConfigData, ModuleData, RuleSettingsData } from './data.ts';
import { declarationOf, type Model, type ModuleView } from './resolve.ts';
import { isRecord } from './shared.ts';

export interface RuleAt {
  on: boolean;
  options: Record<string, unknown>;
}

export interface Settings {
  atFile(file: string, id: string, defaults?: object): RuleAt;
  atModule(module: ModuleView, id: string, defaults?: object): RuleAt;
}

type Layers = readonly (RuleSettingsData | undefined)[];

const archetypeOf = (config: ConfigData, module: ModuleView): ArchetypeData | undefined =>
  module.archetype === undefined ? undefined : config.archetypes[module.archetype];

const own = (config: ConfigData, module: ModuleView): Layers => [
  archetypeOf(config, module)?.ruleset,
  declarationOf(config, module)?.ruleset,
];

type TestRulesetOf = { testRuleset?: RuleSettingsData } | undefined;

const ownTests = (config: ConfigData, module: ModuleView): Layers => [
  archetypeOf(config, module)?.testRuleset,
  (declarationOf(config, module) as TestRulesetOf)?.testRuleset,
];

const production = (config: ConfigData, module: ModuleView): Layers => [
  ...(module.parent ? production(config, module.parent) : []),
  ...own(config, module),
];

const tests = (config: ConfigData, module: ModuleView): Layers => [
  ...(module.parent ? tests(config, module.parent) : []),
  ...ownTests(config, module),
];

const filesModuleOf = (config: ConfigData, holder: ModuleView, test: ModuleView): ModuleData | undefined => {
  const of = (declarationOf(config, test) as { of?: string } | undefined)?.of;
  return of === undefined ? undefined : archetypeOf(config, holder)!.modules.find((module) => module.name === of);
};

const layersOf = (config: ConfigData, module: ModuleView): Layers => {
  if (!module.test) return production(config, module);
  const chain: ModuleView[] = [];
  let holder = module;
  for (; holder.test && holder.parent; holder = holder.parent) chain.unshift(holder);
  const files = filesModuleOf(config, holder, chain[0]!);
  return [
    ...production(config, holder),
    files?.ruleset,
    ...tests(config, holder),
    (files as TestRulesetOf)?.testRuleset,
    ...chain.flatMap((test) => own(config, test)),
  ];
};

export const merged = (base: RuleSettingsData, layer: RuleSettingsData | undefined): RuleSettingsData => {
  if (layer === undefined) return base;
  const result: RuleSettingsData = Object.hasOwn(layer, '*') ? {} : { ...base };
  for (const [id, setting] of Object.entries(layer)) {
    const was = result[id];
    if (setting === true && isRecord(was)) continue;
    result[id] = isRecord(setting) && isRecord(was) ? { ...was, ...setting } : setting;
  }
  return result;
};

const ruleAt = (settings: RuleSettingsData, id: string, defaults: object = {}): RuleAt => {
  const setting = Object.hasOwn(settings, id) ? settings[id] : settings['*'];
  return {
    on: setting !== undefined && setting !== false,
    options: { ...defaults, ...(isRecord(setting) ? setting : {}) },
  };
};

export const settings = (config: ConfigData, model: Model): Settings => {
  const cache = new Map<ModuleView, RuleSettingsData>();
  const at = (module: ModuleView | undefined): RuleSettingsData => {
    if (!module) return {};
    let found = cache.get(module);
    if (!found) cache.set(module, (found = layersOf(config, module).reduce(merged, {})));
    return found;
  };
  return {
    atFile: (file, id, defaults) => ruleAt(at(model.moduleOf(file)), id, defaults),
    atModule: (module, id, defaults) => ruleAt(at(module), id, defaults),
  };
};

export type ResolvedRules = Record<string, false | Record<string, unknown>>;

export interface RulesOf {
  defaults: ResolvedRules;
  module(module: ModuleView): ResolvedRules;
}

export const rulesOf = (
  config: ConfigData,
  model: Model,
  rules: readonly { id: string; defaults?: object }[],
): RulesOf => {
  const settled = settings(config, model);
  return {
    defaults: Object.fromEntries(rules.map(({ id, defaults }) => [id, { ...defaults }])),
    module: (module) =>
      Object.fromEntries(
        rules.map(({ id, defaults }) => {
          const { on, options } = settled.atModule(module, id, defaults);
          return [id, on ? options : false];
        }),
      ),
  };
};

const turnsOn = (ruleset: RuleSettingsData | undefined): boolean =>
  ruleset !== undefined && Object.values(ruleset).some((setting) => setting !== false);

const rulesetsOf = (place: ArchetypeData | ModuleData) => [
  place.ruleset,
  'testRuleset' in place ? place.testRuleset : undefined,
];

export const anyRuleOn = (config: ConfigData): boolean =>
  Object.values(config.archetypes).some((archetype) =>
    [archetype, ...archetype.modules].flatMap(rulesetsOf).some(turnsOn),
  );
