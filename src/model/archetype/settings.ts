import type { ConfigData, RuleSettingsData } from './data.ts';
import type { Model, UnitView } from './resolve.ts';
import { isRecord } from './shared.ts';

export interface RuleAt {
  on: boolean;
  options: Record<string, unknown>;
}

export interface Settings {
  atFile(file: string, id: string, defaults?: object): RuleAt;
  atPart(unit: UnitView, part: string, id: string, defaults?: object): RuleAt;
  atUnit(unit: UnitView, id: string, defaults?: object): RuleAt;
}

type Levels = readonly (RuleSettingsData | undefined)[];

export const settings = (config: ConfigData, model: Model): Settings => {
  const unitLevels = (unit: UnitView): Levels => [
    dirPartOf(config, unit)?.rules,
    unit.archetype === undefined ? undefined : config.archetypes[unit.archetype]!.rules,
    ...(unit.parent ? unitLevels(unit.parent) : [config.rules]),
  ];
  const atPart = (unit: UnitView, part: string | undefined, id: string, defaults?: object) => {
    const filesPart =
      part === undefined ? undefined : config.archetypes[unit.archetype!]!.parts.find((p) => p.name === part);
    return ruleAt([filesPart?.rules, ...unitLevels(unit)], id, defaults);
  };
  return {
    atFile: (file, id, defaults) => {
      const unit = model.unitOf(file);
      if (!unit) return ruleAt([config.rules], id, defaults);
      return atPart(unit, model.partOf(file), id, defaults);
    },
    atPart,
    atUnit: (unit, id, defaults) => ruleAt(unitLevels(unit), id, defaults),
  };
};

const dirPartOf = (config: ConfigData, unit: UnitView) => {
  if (!unit.parent) return undefined;
  const name = unit.part!.slice(unit.part!.lastIndexOf('.') + 1);
  return config.archetypes[unit.parent.archetype!]!.parts.find((part) => part.name === name);
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

const ruleAt = (levels: Levels, id: string, defaults: object = {}): RuleAt => ({
  on: levels.map((level) => decision(level, id)).find((said) => said !== undefined) ?? true,
  options: Object.assign({}, defaults, ...levels.map((level) => optionsAt(level, id)).reverse()),
});

export type ResolvedRules = Record<string, false | Record<string, unknown>>;

export interface RulesOf {
  defaults: ResolvedRules;
  unit(unit: UnitView): ResolvedRules;
  part(unit: UnitView, part: string): ResolvedRules;
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
    unit: (unit) => resolved((id, defaults) => settled.atUnit(unit, id, defaults)),
    part: (unit, part) => resolved((id, defaults) => settled.atPart(unit, part, id, defaults)),
  };
};
