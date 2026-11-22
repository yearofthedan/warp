import type { ConfigData } from './archetype/data.ts';
import type { Verdicts } from './archetype/reach.ts';
import type { Model, UnitView } from './archetype/resolve.ts';
import type { ModuleFacts, Project } from './facts.ts';

export interface EnabledRule {
  rule: Rule;
  options: object;
}

export interface Kind {
  name: string;
  match: string[];
  dependsOn: string[];
  rules: EnabledRule[];
}

export interface Finding {
  rule: string;
  key: string;
  file: string;
  line: number;
  value: number;
  limit?: number;
  message: string;
  docs?: string;
  details?: unknown;
}

export interface ModuleContext<Options> {
  module: ModuleFacts;
  options: Options;
}

export interface RuleContext<Options> extends ModuleContext<Options> {
  kind: Kind;
  kindOf: (file: string) => Kind | undefined;
}

export interface Setting<Options> {
  on: boolean;
  options: Options;
}

export interface ProjectContext<Options> {
  project: Project;
  config: ConfigData;
  model: Model;
  verdicts: Verdicts;
  atFile: (file: string) => Setting<Options>;
  atUnit: (unit: UnitView) => Setting<Options>;
}

interface RuleBase<Options extends object> {
  id: string;
  docs?: string;
  defaults?: Options;
  parseOptions?: (raw: Record<string, unknown>, at: string) => Partial<Options>;
}

export interface Rule<Options extends object = object> extends RuleBase<Options> {
  check: (context: RuleContext<Options>) => Finding[];
}

export interface ModuleRule<Options extends object = object> extends RuleBase<Options> {
  scope?: 'module';
  check: (context: ModuleContext<Options>) => Finding[];
}

export interface ProjectRule<Options extends object = object> extends RuleBase<Options> {
  scope: 'project';
  check: (context: ProjectContext<Options>) => Finding[];
}

export type ArchetypeRule = ModuleRule<any> | ProjectRule<any>;

export interface Plugin {
  rules: readonly Rule<any>[];
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export const noOptions = (raw: Record<string, unknown>, at: string): Partial<object> => {
  const keys = Object.keys(raw);
  if (keys.length > 0) throw new ConfigError(`${at}: unknown key ${keys.join(', ')}`);
  return {};
};

export const wholeNumberOptions =
  <Options extends Record<string, number>>(defaults: Options) =>
  (raw: Record<string, unknown>, at: string): Partial<Options> => {
    const unknown = Object.keys(raw).filter((key) => !(key in defaults));
    if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new ConfigError(`${at}.${key}: expected a whole number of at least 1`);
      }
    }
    return raw as Partial<Options>;
  };
