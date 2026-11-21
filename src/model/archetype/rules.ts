/** The rules an archetype config runs on its model, and how to check their options. */
import { ConfigError, noOptions } from '../rule.ts';

export interface CycleOptions {
  /** Whether a type-only edge, which doesn't load at run time, is part of a loop. Default `ignore`. */
  types: 'count' | 'ignore';
}

const cycleOptions = (raw: Record<string, unknown>, at: string): Partial<CycleOptions> => {
  const unknown = Object.keys(raw).filter((key) => key !== 'types');
  if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
  if (raw.types !== undefined && raw.types !== 'count' && raw.types !== 'ignore')
    throw new ConfigError(`${at}.types: expected 'count' or 'ignore'`);
  return raw as Partial<CycleOptions>;
};

/** Each configurable rule's option check, by id. Throws a ConfigError naming `at`. */
export const modelRules: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>> = {
  'dependency-direction': noOptions,
  'unit-cycle': cycleOptions,
  'no-cycle': cycleOptions,
};
