/**
 * The first pass of loading: finds every archetype the root reaches, runs its callbacks, and checks everything but
 * its references, which need every archetype's surfaces first.
 */
import { partRefs, type RecordedArchetype, type RecordedPart, recordedAs, requiredRefs, self } from './builder.ts';
import type { ArchetypeData, IdentifyData, Loose, PartData, RequirementData } from './data.ts';
import { type Fail, isName, isRecord } from './shared.ts';

export interface DraftPart {
  data: PartData;
  using: unknown[];
  rules: unknown;
}

/** An archetype as data, with the values its references come from still as the builders recorded them. */
export interface Draft {
  data: ArchetypeData;
  parts: DraftPart[];
  exposes?: Record<string, unknown[]>;
  provides: Record<string, unknown>;
  rules: unknown;
}

const looseValues: readonly unknown[] = ['allow', 'warn', 'deny'];

/** Every archetype the root reaches through dir parts and requirements, by name. */
export const collect = (root: RecordedArchetype, fail: Fail): Map<string, RecordedArchetype> => {
  const byName = new Map<string, RecordedArchetype>();
  const pending = [root];
  for (let state = pending.shift(); state; state = pending.shift()) {
    const known = byName.get(state.name as string);
    if (!isName(state.name)) fail(`archetype(${JSON.stringify(state.name)}): a name is a non-empty string`);
    else if (known && known !== state) fail(`two archetypes are named ${state.name}: give each its own name`);
    else if (!known) {
      byName.set(state.name, state);
      pending.push(...reached(state));
    }
  }
  return byName;
};

/** The archetypes an archetype's dir parts and requirements name. */
const reached = (state: RecordedArchetype): RecordedArchetype[] =>
  [
    ...entriesOf(state.parts).map((part) => (part as { archetype?: unknown }).archetype),
    ...Object.values(isRecord(state.requires) ? state.requires : {}),
  ].flatMap((value) => recordedAs(value, 'archetype') ?? []);

const entriesOf = (parts: unknown): readonly RecordedPart[] => (Array.isArray(parts) ? parts : []);

/** What a callback given `s` returns, or undefined when it is no callback. */
const callback = (value: unknown): unknown => (typeof value === 'function' ? value(partRefs()) : undefined);

/** Runs an archetype's callbacks and checks everything but its references. */
export const draft = (name: string, state: RecordedArchetype, fail: Fail): Draft => {
  checkFields(name, state, fail);
  const identify = identifyData(name, state.identify, fail);
  const requires = requirements(name, state.requires, fail);
  const parts = draftParts(name, state.parts, fail);
  const exposes = callback(state.exposes);
  if (state.exposes !== undefined && !isRecord(exposes))
    fail(`${name}.exposes: expected a callback returning surfaces, (s) => ({ render: s.dom })`);
  const provides = state.provides === undefined ? {} : callback(state.provides);
  if (!isRecord(provides))
    fail(`${name}.provides: expected a callback returning parts by name, (s) => ({ strings: s.strings })`);
  return {
    data: {
      name,
      description: state.description as string | undefined,
      identify,
      requires,
      parts: parts.map((part) => part.data),
      provides: {},
      loose: state.loose as Loose | undefined,
    },
    parts,
    exposes: isRecord(exposes)
      ? Object.fromEntries(Object.entries(exposes).map(([surface, refs]) => [surface, [refs].flat()]))
      : undefined,
    provides: isRecord(provides) ? provides : {},
    rules: typeof state.rules === 'function' ? state.rules(partRefs(), { required: requiredRefs() }) : state.rules,
  };
};

const checkFields = (name: string, state: RecordedArchetype, fail: Fail) => {
  if (state.description !== undefined && typeof state.description !== 'string')
    fail(`${name}.description: expected a string`);
  if (state.loose !== undefined && !looseValues.includes(state.loose))
    fail(`${name}.loose: expected 'allow', 'warn' or 'deny'`);
  if (!Array.isArray(state.parts)) fail(`${name}.contains: expected the parts chain, (p) => p.files(...)`);
};

const draftParts = (archetype: string, recordedParts: unknown, fail: Fail): DraftPart[] => {
  const parts: DraftPart[] = [];
  for (const recordedPart of entriesOf(recordedParts)) {
    const part = draftPart(archetype, recordedPart, fail);
    if (parts.some((other) => other.data.name === part.data.name))
      fail(`${archetype}: part '${part.data.name}' is already declared`);
    else parts.push(part);
  }
  return parts;
};

const draftPart = (archetype: string, part: RecordedPart, fail: Fail): DraftPart => {
  const { name } = part;
  if (!isName(name) || name.includes('.'))
    fail(`${archetype}: a part's name is a non-empty string without dots, not ${JSON.stringify(name)}`);
  const where = `${archetype}.${String(name)}`;
  const patterns = [part.kind === 'files' ? part.patterns : part.paths].flat() as string[];
  if (patterns.length === 0 || !patterns.every(isName))
    fail(`${where}: expected a ${part.kind === 'files' ? 'pattern' : 'path'} or a list of them`);
  const options = partOptions(where, part.options, fail);
  const using = typeof options.using === 'function' ? options.using(partRefs()) : (options.using ?? []);
  if (!Array.isArray(using)) fail(`${where}.using: expected a list of references, or a callback returning one`);
  const common = { name: name as string, using: [], description: options.description as string | undefined };
  const data: PartData =
    part.kind === 'files'
      ? { kind: part.kind, ...common, patterns }
      : { kind: part.kind, ...common, paths: patterns, archetype: dirArchetype(archetype, part.archetype) };
  return { data, using: Array.isArray(using) ? using : [], rules: options.rules };
};

const partOptions = (where: string, value: unknown, fail: Fail): Record<string, unknown> => {
  if (value !== undefined && !isRecord(value)) fail(`${where}: expected options, { using, rules }`);
  const options = isRecord(value) ? value : {};
  const unknownKeys = Object.keys(options).filter((key) => !['using', 'rules', 'description'].includes(key));
  if (unknownKeys.length > 0) fail(`${where}: unknown option ${unknownKeys.join(', ')}`);
  if (options.description !== undefined && typeof options.description !== 'string')
    fail(`${where}.description: expected a string`);
  return options;
};

/** A dir part's archetype by name: `self` is the archetype that holds the part. */
const dirArchetype = (holder: string, value: unknown): string | undefined =>
  value === self ? holder : (recordedAs(value, 'archetype')?.name as string | undefined);

const requirements = (archetype: string, value: unknown, fail: Fail): Record<string, RequirementData> => {
  if (!isRecord(value)) {
    fail(`${archetype}.requires: expected requirements by name, { testRunner, strings: dir() }`);
    return {};
  }
  const result: Record<string, RequirementData> = {};
  for (const [name, requirement] of Object.entries(value)) {
    const shape = recordedAs(requirement, 'shape');
    const required = recordedAs(requirement, 'archetype');
    if (shape) result[name] = { kind: shape };
    else if (required) result[name] = { kind: 'archetype', archetype: required.name as string };
    else fail(`${archetype}.requires.${name}: expected an archetype, dir() or files()`);
  }
  return result;
};

const identifyData = (archetype: string, value: unknown, fail: Fail): IdentifyData | undefined => {
  const keys = isRecord(value) ? Object.keys(value) : [];
  if (value === undefined || (keys.length === 1 && isName((value as { marker?: unknown }).marker)))
    return value as IdentifyData | undefined;
  if (keys.length === 1 && typeof (value as { match?: unknown }).match === 'function') return value as IdentifyData;
  fail(`${archetype}.identify: expected { marker: '{name}.dom.ts' } or { match: (dir, chain) => ... }`);
  return undefined;
};
