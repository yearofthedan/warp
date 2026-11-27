import type { ConfigData, RuleSettingsData } from './data.ts';
import { declarationOf, type Model, type ModuleView } from './resolve.ts';
import { isRecord } from './shared.ts';

export interface RuleAt {
  on: boolean;
  options: Record<string, unknown>;
}

export type DefaultOn = 'everywhere' | 'root';

export interface Settings {
  atFile(file: string, id: string, defaults?: object, defaultOn?: DefaultOn): RuleAt;
  atModule(module: ModuleView, id: string, defaults?: object, defaultOn?: DefaultOn): RuleAt;
}

type Levels = readonly (RuleSettingsData | undefined)[];

const own = (config: ConfigData, module: ModuleView): Levels => [
  declarationOf(config, module)?.rules,
  module.archetype === undefined ? undefined : config.archetypes[module.archetype]!.rules,
];

const levels = (config: ConfigData, module: ModuleView): Levels => [
  ...own(config, module),
  ...(module.parent ? levels(config, module.parent) : [config.rules]),
];

const unsetOn = (module: ModuleView | undefined, defaultOn: DefaultOn = 'everywhere'): boolean =>
  defaultOn === 'everywhere' || module?.parent === undefined;

export const settings = (config: ConfigData, model: Model): Settings => {
  const fileLevels = (file: string): Levels => {
    const module = model.moduleOf(file);
    return module ? levels(config, module) : [config.rules];
  };
  return {
    atFile: (file, id, defaults, defaultOn) =>
      ruleAt(fileLevels(file), id, defaults, unsetOn(model.moduleOf(file), defaultOn)),
    atModule: (module, id, defaults, defaultOn) =>
      ruleAt(levels(config, module), id, defaults, unsetOn(module, defaultOn)),
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

const ruleAt = (levels: Levels, id: string, defaults: object = {}, unsetOn = true): RuleAt => ({
  on: decided(levels, id) ?? unsetOn,
  options: Object.assign({}, defaults, ...levels.map((level) => optionsAt(level, id)).reverse()),
});

export type ResolvedRules = Record<string, false | Record<string, unknown>>;

export interface RulesOf {
  defaults: ResolvedRules;
  module(module: ModuleView): ResolvedRules;
  inherited(module: ModuleView): ResolvedRules;
}

type RuleIds = readonly { id: string; defaults?: object; defaultOn?: DefaultOn }[];

export const rulesOf = (config: ConfigData, model: Model, rules: RuleIds): RulesOf => {
  const resolved = (at: Levels, module: ModuleView): ResolvedRules =>
    Object.fromEntries(
      rules.map(({ id, defaults, defaultOn }) => {
        const { on, options } = ruleAt(at, id, defaults, unsetOn(module, defaultOn));
        return [id, on ? options : false];
      }),
    );
  return {
    defaults: Object.fromEntries(rules.map(({ id, defaults }) => [id, { ...defaults }])),
    module: (module) => resolved(levels(config, module), module),
    inherited: (module) => resolved(module.parent ? levels(config, module.parent) : [config.rules], module),
  };
};

const turnsOn = (rules: RuleSettingsData | undefined): boolean =>
  rules !== undefined && rules !== 'off' && Object.values(rules).some((setting) => setting !== false);

export const anyRuleOn = (config: ConfigData): boolean =>
  config.rules === undefined ||
  (config.rules !== 'off' && config.rules['*'] !== false) ||
  turnsOn(config.rules) ||
  Object.values(config.archetypes).some(
    (archetype) => turnsOn(archetype.rules) || archetype.modules.some((module) => turnsOn(module.rules)),
  );
