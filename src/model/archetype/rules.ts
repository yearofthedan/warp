import { ConfigError, noOptions } from '../rule.ts';

export interface CycleOptions {
  types: 'count' | 'ignore';
}

const cycleOptions = (raw: Record<string, unknown>, at: string): Partial<CycleOptions> => {
  const unknown = Object.keys(raw).filter((key) => key !== 'types');
  if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
  if (raw.types !== undefined && raw.types !== 'count' && raw.types !== 'ignore')
    throw new ConfigError(`${at}.types: expected 'count' or 'ignore'`);
  return raw as Partial<CycleOptions>;
};

export const modelRules: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>> = {
  'dependency-direction': noOptions,
  'unit-externals': noOptions,
  'no-double-export': noOptions,
  'unit-cycle': cycleOptions,
  'no-cycle': cycleOptions,
};
