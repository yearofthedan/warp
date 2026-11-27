import type { ArchetypeData, ConfigData, ModuleData, RefData, RuleSettingsData, RulesetData } from './data.ts';
import { modulesNamed } from './reach.ts';
import { declarationOf, type Model, type ModuleView } from './resolve.ts';
import { isRecord } from './shared.ts';

export interface RuleAt {
  on: boolean;
  options: Record<string, unknown>;
}

export interface Settings {
  atFile(file: string, id: string, defaults?: object, moduleOptions?: readonly string[]): RuleAt;
  atModule(module: ModuleView, id: string, defaults?: object, moduleOptions?: readonly string[]): RuleAt;
}

interface Layer {
  ruleset: RulesetData | undefined;
  holder: ModuleView;
}

interface Settled {
  rules: RuleSettingsData;
  holder: ModuleView;
}

const archetypeOf = (config: ConfigData, module: ModuleView): ArchetypeData | undefined =>
  module.archetype === undefined ? undefined : config.archetypes[module.archetype];

type TestRulesetOf = { testRuleset?: RulesetData } | undefined;

const layered = (config: ConfigData, module: ModuleView, test: boolean): Layer[] => {
  const pick = (place: ArchetypeData | ModuleData | undefined) =>
    test ? (place as TestRulesetOf)?.testRuleset : place?.ruleset;
  const inside = { ruleset: pick(archetypeOf(config, module)), holder: module };
  return module.parent ? [inside, { ruleset: pick(declarationOf(config, module)), holder: module.parent }] : [inside];
};

const production = (config: ConfigData, module: ModuleView): Layer[] => [
  ...(module.parent ? production(config, module.parent) : []),
  ...layered(config, module, false),
];

const tests = (config: ConfigData, module: ModuleView): Layer[] => [
  ...(module.parent ? tests(config, module.parent) : []),
  ...layered(config, module, true),
];

const filesModuleOf = (config: ConfigData, holder: ModuleView, test: ModuleView): ModuleData | undefined => {
  const of = (declarationOf(config, test) as { of?: string } | undefined)?.of;
  return of === undefined ? undefined : archetypeOf(config, holder)!.modules.find((module) => module.name === of);
};

const layersOf = (config: ConfigData, module: ModuleView): Layer[] => {
  if (!module.test) return production(config, module);
  const chain: ModuleView[] = [];
  let holder = module;
  for (; holder.test && holder.parent; holder = holder.parent) chain.unshift(holder);
  const files = filesModuleOf(config, holder, chain[0]!);
  return [
    ...production(config, holder),
    { ruleset: files?.ruleset, holder },
    ...tests(config, holder),
    { ruleset: (files as TestRulesetOf)?.testRuleset, holder },
    ...chain.flatMap((test) => layered(config, test, false)),
  ];
};

const named = (config: ConfigData, { holder }: Settled, refs: unknown): string[] =>
  (refs as RefData[]).flatMap((ref) => modulesNamed(config, holder, ref).map((module) => module.id));

const ruleAt = (
  config: ConfigData,
  layers: readonly Settled[],
  id: string,
  defaults: object = {},
  moduleOptions: readonly string[] = [],
): RuleAt => {
  const at: RuleAt = { on: false, options: { ...defaults } };
  for (const layer of layers) {
    const setting = Object.hasOwn(layer.rules, id) ? layer.rules[id] : layer.rules['*'];
    if (setting === undefined) continue;
    at.on = setting !== false;
    if (!isRecord(setting)) continue;
    const modules = moduleOptions.filter((key) => Array.isArray(setting[key]));
    Object.assign(
      at.options,
      setting,
      Object.fromEntries(modules.map((key) => [key, named(config, layer, setting[key])])),
    );
  }
  return at;
};

export const settings = (config: ConfigData, model: Model): Settings => {
  const cache = new Map<ModuleView, readonly Settled[]>();
  const at = (module: ModuleView | undefined): readonly Settled[] => {
    if (!module) return [];
    let found = cache.get(module);
    if (!found)
      cache.set(
        module,
        (found = layersOf(config, module).flatMap(({ ruleset, holder }) =>
          (ruleset ?? []).map((rules) => ({ rules, holder })),
        )),
      );
    return found;
  };
  return {
    atFile: (file, id, defaults, moduleOptions) =>
      ruleAt(config, at(model.moduleOf(file)), id, defaults, moduleOptions),
    atModule: (module, id, defaults, moduleOptions) => ruleAt(config, at(module), id, defaults, moduleOptions),
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
  rules: readonly { id: string; defaults?: object; moduleOptions?: readonly string[] }[],
): RulesOf => {
  const settled = settings(config, model);
  return {
    defaults: Object.fromEntries(rules.map(({ id, defaults }) => [id, { ...defaults }])),
    module: (module) =>
      Object.fromEntries(
        rules.map(({ id, defaults, moduleOptions }) => {
          const { on, options } = settled.atModule(module, id, defaults, moduleOptions);
          return [id, on ? options : false];
        }),
      ),
  };
};

const turnsOn = (ruleset: RulesetData | undefined): boolean =>
  ruleset !== undefined && ruleset.some((layer) => Object.values(layer).some((setting) => setting !== false));

const rulesetsOf = (place: ArchetypeData | ModuleData) => [
  place.ruleset,
  'testRuleset' in place ? place.testRuleset : undefined,
];

export const anyRuleOn = (config: ConfigData): boolean =>
  Object.values(config.archetypes).some((archetype) =>
    [archetype, ...archetype.modules].flatMap(rulesetsOf).some(turnsOn),
  );
