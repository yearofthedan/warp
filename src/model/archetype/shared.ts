/** Helpers the load-time checks share. */
import type { PartData } from './data.ts';

/** Records a config problem, to be reported with the rest. */
export type Fail = (message: string) => void;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isName = (value: unknown): value is string => typeof value === 'string' && value !== '';

export const list = (items: readonly string[], none: string): string => (items.length > 0 ? items.join(', ') : none);

/** The object without its undefined values, so absent settings stay absent in the data. */
export const defined = <T extends object>(object: T): T =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T;

export const shapeText = (kind: 'dir' | 'files'): string => (kind === 'dir' ? 'a plain folder' : 'a files part');

/** A dir part's archetype; files parts and plain folders have none. */
export const archetypeOf = (part: PartData): string | undefined => (part as { archetype?: string }).archetype;
