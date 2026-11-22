import type { ModuleFacts } from './facts.ts';

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

export interface RuleContext<Options> {
  module: ModuleFacts;
  kind: Kind;
  options: Options;
  kindOf: (file: string) => Kind | undefined;
}

export interface Rule<Options extends object = object> {
  id: string;
  docs?: string;
  defaults?: Options;
  parseOptions?: (raw: Record<string, unknown>, at: string) => Partial<Options>;
  check: (context: RuleContext<Options>) => Finding[];
}

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
