import { ConfigError } from '../errors/configError.ts';
import type { ConfigData } from '../model/data.ts';
import type { Verdicts } from '../model/reach.ts';
import type { Model, ModuleView } from '../model/resolve.ts';
import type { FileFacts, Project } from '../facts/facts.ts';

export interface Site {
  file: string;
  line: number;
}

export interface Finding {
  rule: string;
  key: string;
  file: string;
  line: number;
  module?: string;
  value: number;
  limit?: number;
  message: string;
  docs?: string;
  sites?: Site[];
  parts?: string[];
  details?: unknown;
}

export interface FileContext<Options> {
  file: FileFacts;
  options: Options;
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
  atModule: (module: ModuleView) => Setting<Options>;
}

interface RuleBase<Options extends object> {
  id: string;
  docs?: string;
  defaults?: Options;
  moduleOptions?: readonly string[];
  parseOptions?: (raw: Record<string, unknown>, at: string) => Partial<Options>;
}

export interface FileRule<Options extends object = object> extends RuleBase<Options> {
  scope?: 'file';
  check: (context: FileContext<Options>) => Finding[];
}

export interface ProjectRule<Options extends object = object> extends RuleBase<Options> {
  scope: 'project';
  check: (context: ProjectContext<Options>) => Finding[];
}

export type Rule = FileRule<any> | ProjectRule<any>;

export type RuleSetting = 'on' | 'off' | boolean | Record<string, unknown>;

export interface RulesetDefinition {
  extends?: readonly string[];
  rules?: Readonly<Record<string, RuleSetting>>;
}

export interface Plugin {
  rules: readonly Rule[];
  rulesets?: Readonly<Record<string, RulesetDefinition>>;
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
