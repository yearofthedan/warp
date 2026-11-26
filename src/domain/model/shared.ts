export type Fail = (message: string) => void;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isName = (value: unknown): value is string => typeof value === 'string' && value !== '';

export const list = (items: readonly string[], none: string): string => (items.length > 0 ? items.join(', ') : none);

export const defined = <T extends object>(object: T): T =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T;
