import type { ConfigData, RuleSettingsData } from './data.ts';
import type { Model, ModuleView } from './resolve.ts';
import { isRecord } from './shared.ts';

export interface RuleAt {
  on: boolean;
  options: Record<string, unknown>;
}

export interface Settings {
  atFile(file: string, id: string, defaults?: object): RuleAt;
  atPart(module: ModuleView, part: string, id: string, defaults?: object): RuleAt;
  atModule(module: ModuleView, id: string, defaults?: object): RuleAt;
  decidedAt(module: ModuleView, id: string): boolean | undefined;
}

type Levels = readonly (RuleSettingsData | undefined)[];

export const settings = (config: ConfigData, model: Model): Settings => {
  const moduleLevels = (module: ModuleView): Levels => [
    dirPartOf(config, module)?.rules,
    module.archetype === undefined ? undefined : config.archetypes[module.archetype]!.rules,
    ...(module.parent ? moduleLevels(module.parent) : [config.rules]),
  ];
  const atPart = (module: ModuleView, part: string | undefined, id: string, defaults?: object) => {
    const filesPart =
      part === undefined ? undefined : config.archetypes[module.archetype!]!.parts.find((p) => p.name === part);
    return ruleAt([filesPart?.rules, ...moduleLevels(module)], id, defaults);
  };
  return {
    atFile: (file, id, defaults) => {
      const module = model.moduleOf(file);
      if (!module) return ruleAt([config.rules], id, defaults);
      return atPart(module, model.partOf(file), id, defaults);
    },
    atPart,
    atModule: (module, id, defaults) => ruleAt(moduleLevels(module), id, defaults),
    decidedAt: (module, id) => decided(moduleLevels(module), id),
  };
};

const dirPartOf = (config: ConfigData, module: ModuleView) => {
  if (!module.parent) return undefined;
  const name = module.part!.slice(module.part!.lastIndexOf('.') + 1);
  return config.archetypes[module.parent.archetype!]!.parts.find((part) => part.name === name);
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
  part(module: ModuleView, part: string): ResolvedRules;
}

export const rulesOf = (
  config: ConfigData,
  model: Model,
  rules: readonly { id: string; defaults?: object }[],
): RulesOf => {
  const settled = settings(config, model);
  const resolved = (at: (id: string, defaults?: object) => RuleAt): ResolvedRules =>
    Object.fromEntries(
      rules.map(({ id, defaults }) => {
        const { on, options } = at(id, defaults);
        return [id, on ? options : false];
      }),
    );
  return {
    defaults: Object.fromEntries(rules.map(({ id, defaults }) => [id, { ...defaults }])),
    module: (module) => resolved((id, defaults) => settled.atModule(module, id, defaults)),
    part: (module, part) => resolved((id, defaults) => settled.atPart(module, part, id, defaults)),
  };
};
