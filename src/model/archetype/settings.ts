import type { ConfigData, RuleSettingsData, TestLayerData } from './data.ts';
import { declarationOf, type Model, type ModuleView } from './resolve.ts';
import { isRecord } from './shared.ts';

export interface RuleAt {
  on: boolean;
  options: Record<string, unknown>;
}

export interface Settings {
  atFile(file: string, id: string, defaults?: object): RuleAt;
  atModule(module: ModuleView, id: string, defaults?: object): RuleAt;
  decidedAt(module: ModuleView, id: string): boolean | undefined;
}

type Levels = readonly (RuleSettingsData | undefined)[];

const layerOf = (config: ConfigData, module: ModuleView): TestLayerData | undefined => {
  if (module.archetype !== undefined) return config.archetypes[module.archetype]!.tests;
  const declared = declarationOf(config, module);
  return declared?.kind === 'files' ? declared.tests : undefined;
};

const own = (config: ConfigData, module: ModuleView): Levels => [
  declarationOf(config, module)?.rules,
  module.archetype === undefined ? undefined : config.archetypes[module.archetype]!.rules,
];

const testModuleRules = (config: ConfigData, module: ModuleView): RuleSettingsData | undefined =>
  layerOf(config, module.parent!)?.modules.find((data) => `tests.${data.name}` === module.name)?.rules;

const levels = (config: ConfigData, module: ModuleView): Levels => {
  if (module.test) return [testModuleRules(config, module), ...testLevels(config, module.parent!)];
  return [...own(config, module), ...(module.parent ? levels(config, module.parent) : [config.rules])];
};

const testLevels = (config: ConfigData, owner: ModuleView): Levels => [
  layerOf(config, owner)?.rules,
  ...own(config, owner),
  ...(owner.parent ? testLevels(config, owner.parent) : [config.rules]),
];

export const settings = (config: ConfigData, model: Model): Settings => {
  const fileLevels = (file: string): Levels => {
    const module = model.moduleOf(file);
    if (!module) return [config.rules];
    return model.isTest(file) && !module.test ? testLevels(config, module) : levels(config, module);
  };
  return {
    atFile: (file, id, defaults) => ruleAt(fileLevels(file), id, defaults),
    atModule: (module, id, defaults) => ruleAt(levels(config, module), id, defaults),
    decidedAt: (module, id) => decided(levels(config, module), id),
  };
};

const decision = (level: RuleSettingsData | undefined, id: string): boolean | undefined => {
  if (level === undefined) return undefined;
  if (level === 'off') return false;
  if (Object.hasOwn(level, id)) return level[id] !== false;
  return level['*'] as boolean | undefined;
};

const optionsAt = (level: RuleSettingsData | undefined, id: string): object | undefined => {
  const setting = typeof level === 'object' ? level[id] : undefined;
  return isRecord(setting) ? setting : undefined;
};

const decided = (levels: Levels, id: string): boolean | undefined =>
  levels.map((level) => decision(level, id)).find((said) => said !== undefined);

const ruleAt = (levels: Levels, id: string, defaults: object = {}): RuleAt => ({
  on: decided(levels, id) ?? true,
  options: Object.assign({}, defaults, ...levels.map((level) => optionsAt(level, id)).reverse()),
});

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
