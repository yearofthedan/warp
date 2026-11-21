/**
 * Rule settings resolved for a place in the model, nearest first: the file's files part, then for its unit and each
 * unit above it the dir part that found it and its archetype, then the global settings (docs/design/archetypes.md,
 * Thresholds resolve nearest first).
 */
import type { ConfigData, RuleSettingsData } from './data.ts';
import type { Model, UnitView } from './resolve.ts';
import { isRecord } from './shared.ts';

/** A rule at one place: whether it runs, and its options merged nearest first over its defaults. */
export interface RuleAt {
  on: boolean;
  options: Record<string, unknown>;
}

export interface Settings {
  /** The rule where a finding on `file` is reported. */
  atFile(file: string, id: string, defaults?: object): RuleAt;
  /** The rule where a finding on a unit, such as a loop between units, is reported. */
  atUnit(unit: UnitView, id: string, defaults?: object): RuleAt;
}

type Levels = readonly (RuleSettingsData | undefined)[];

/** The rule settings that apply to a config's model. */
export const settings = (config: ConfigData, model: Model): Settings => {
  const unitLevels = (unit: UnitView): Levels => [
    dirPartOf(config, unit)?.rules,
    unit.archetype === undefined ? undefined : config.archetypes[unit.archetype]!.rules,
    ...(unit.parent ? unitLevels(unit.parent) : [config.rules]),
  ];
  return {
    atFile: (file, id, defaults) => {
      const unit = model.unitOf(file);
      if (!unit) return ruleAt([config.rules], id, defaults);
      const part = model.partOf(file);
      const filesPart =
        part === undefined ? undefined : config.archetypes[unit.archetype!]!.parts.find((p) => p.name === part);
      return ruleAt([filesPart?.rules, ...unitLevels(unit)], id, defaults);
    },
    atUnit: (unit, id, defaults) => ruleAt(unitLevels(unit), id, defaults),
  };
};

/** The dir part, in the parent's archetype, that found the unit. */
const dirPartOf = (config: ConfigData, unit: UnitView) => {
  if (!unit.parent) return undefined;
  const name = unit.part!.slice(unit.part!.lastIndexOf('.') + 1);
  return config.archetypes[unit.parent.archetype!]!.parts.find((part) => part.name === name);
};

/** Whether one level turns the rule on or off; undefined when it says nothing about it. */
const decision = (level: RuleSettingsData | undefined, id: string): boolean | undefined => {
  if (level === undefined) return undefined;
  if (level === 'off') return false;
  if (Object.hasOwn(level, id)) return level[id] !== false;
  // Loading checked that '*' is true or false.
  return level['*'] as boolean | undefined;
};

/** One level's options for the rule, when it gives them. */
const optionsAt = (level: RuleSettingsData | undefined, id: string): object | undefined => {
  const setting = typeof level === 'object' ? level[id] : undefined;
  return isRecord(setting) ? setting : undefined;
};

const ruleAt = (levels: Levels, id: string, defaults: object = {}): RuleAt => ({
  on: levels.map((level) => decision(level, id)).find((said) => said !== undefined) ?? true,
  options: Object.assign({}, defaults, ...levels.map((level) => optionsAt(level, id)).reverse()),
});
