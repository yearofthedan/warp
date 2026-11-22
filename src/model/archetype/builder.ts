import { ConfigError } from '../rule.ts';
import type { IdentifyData } from './data.ts';

declare const referenceBrand: unique symbol;
declare const packageBrand: unique symbol;
declare const shapeBrand: unique symbol;
declare const selfBrand: unique symbol;
declare const exposesType: unique symbol;
declare const partBrand: unique symbol;
declare const rulesetBrand: unique symbol;

export interface Reference {
  readonly [referenceBrand]: true;
}

export interface Package {
  readonly [packageBrand]: true;
}

export interface Shape {
  readonly [shapeBrand]: 'dir' | 'files';
}

export interface Self {
  readonly [selfBrand]: true;
}

export interface PartHandle {
  readonly [partBrand]: true;
}

export type RuleSettings = 'off' | Record<string, boolean | object>;

export interface Archetype<N extends string = string, E = unknown> {
  readonly name: N;
  readonly [exposesType]?: E;
}

export type AnyArchetype = Archetype<string, any>;

export type SurfaceRefs<E> = Reference & { readonly [K in keyof E]: Reference };
type AnySurface = Reference & { readonly [surface: string]: Reference };

type UnitsRef<A> = A extends Self ? AnySurface : A extends Archetype<string, infer E> ? SurfaceRefs<E> : Reference;

export type Using<C> = readonly (Reference | Package)[] | ((s: C) => readonly (Reference | Package)[]);

export interface PartOptions<C> {
  using?: Using<C>;
  description?: string;
}

export const archetypeMethods = [
  'name',
  'identify',
  'requires',
  'contains',
  'exposes',
  'provides',
  'description',
] as const;

type NewName<K extends string, C> = K extends keyof C
  ? `part '${K}' is already declared`
  : K extends (typeof archetypeMethods)[number]
    ? `part '${K}' would hide the archetype's ${K}`
    : K;

export interface Parts<C> {
  files<const K extends string>(
    name: NewName<K, C>,
    patterns: string | readonly string[],
    options?: PartOptions<C>,
  ): Parts<C & { readonly [k in K]: Reference }>;
  dir<const K extends string>(
    name: NewName<K, C>,
    path: string | readonly string[],
    options?: PartOptions<C>,
  ): Parts<C & { readonly [k in K]: Reference }>;
  dir<const K extends string, A extends AnyArchetype | Self>(
    name: NewName<K, C>,
    path: string | readonly string[],
    archetype: A,
    options?: PartOptions<C>,
  ): Parts<C & { readonly [k in K]: UnitsRef<A> }>;
}

export interface ContainsContext<R> {
  required: R;
  self: Self;
}

export type Identify = IdentifyData;

type PartHandles<C> = { readonly [K in keyof C]: PartHandle };

export type ArchetypeBuilder<N extends string, C, R, E> = ArchetypeMethods<N, C, R, E> & PartHandles<C>;

export interface ArchetypeMethods<N extends string, C, R, E> extends Archetype<N, E> {
  identify(identify: Identify): ArchetypeBuilder<N, C, R, E>;
  requires<const R2 extends Record<string, AnyArchetype | Shape>>(
    requires: R2,
  ): ArchetypeBuilder<N, C, { readonly [K in keyof R2]: UnitsRef<R2[K]> }, E>;
  contains<C2>(parts: (p: Parts<{}>, context: ContainsContext<R>) => Parts<C2>): ArchetypeBuilder<N, C2, R, E>;
  exposes<const E2 extends Record<string, Reference | readonly Reference[]>>(
    exposes: (s: C) => E2,
  ): ArchetypeBuilder<N, C, R, E2>;
  provides(provides: (s: C) => Record<string, Reference>): ArchetypeBuilder<N, C, R, E>;
  description(description: string): ArchetypeBuilder<N, C, R, E>;
}

export interface Ruleset {
  readonly [rulesetBrand]: true;
  rules(settings: RuleSettings): Ruleset;
  on(target: AnyArchetype | PartHandle, settings: RuleSettings): Ruleset;
  extends(base: Ruleset): Ruleset;
}

export interface WarpConfig {
  root: AnyArchetype;
  tsconfig?: string | readonly string[];
  plugins?: Record<string, unknown>;
  rulesets?: Record<string, Ruleset>;
}

const recorded = Symbol('warp.recorded');

export type RecordedRef =
  | { kind: 'part'; part: string; surface?: string }
  | { kind: 'required'; name: string; surface?: string }
  | { kind: 'package'; pattern: string };

export type RecordedPart =
  | { kind: 'files'; name: unknown; patterns: unknown; options: unknown }
  | { kind: 'dir'; name: unknown; paths: unknown; archetype?: unknown; options: unknown };

export interface RecordedArchetype {
  name: unknown;
  identify?: unknown;
  requires: unknown;
  parts: unknown;
  exposes?: unknown;
  provides?: unknown;
  description?: unknown;
}

export interface RecordedRuleset {
  base?: unknown;
  entries: readonly { target?: unknown; settings: unknown }[];
}

interface Recorded {
  ref: RecordedRef;
  self: true;
  shape: 'dir' | 'files';
  parts: readonly RecordedPart[];
  archetype: RecordedArchetype;
  partHandle: { archetype: unknown; part: unknown };
  ruleset: RecordedRuleset;
}

const record = <T extends keyof Recorded>(type: T, data: Recorded[T]) => ({ [recorded]: { type, data } });

export const recordedAs = <T extends keyof Recorded>(value: unknown, type: T): Recorded[T] | undefined => {
  const entry = (value as { [recorded]?: { type: unknown; data: Recorded[T] } } | null | undefined)?.[recorded];
  return entry?.type === type ? entry.data : undefined;
};

const ref = (data: RecordedRef) => Object.freeze(record('ref', data));

const surfaces = (base: Exclude<RecordedRef, { kind: 'package' }>): unknown =>
  new Proxy(ref(base), {
    get: (target, key) => (typeof key === 'string' ? ref({ ...base, surface: key }) : Reflect.get(target, key)),
  });

const names = (make: (name: string) => Exclude<RecordedRef, { kind: 'package' }>): unknown =>
  new Proxy({}, { get: (_, key) => surfaces(make(String(key))) });

export const partRefs = (): unknown => names((part) => ({ kind: 'part', part }));
export const requiredRefs = (): unknown => names((name) => ({ kind: 'required', name }));

export const self: Self = Object.freeze(record('self', true)) as never;

const parts = (entries: readonly RecordedPart[]): unknown => ({
  ...record('parts', entries),
  files: (name: unknown, patterns: unknown, options?: unknown) =>
    parts([...entries, { kind: 'files', name, patterns, options }]),
  dir: (name: unknown, paths: unknown, archetypeOrOptions?: unknown, options?: unknown) =>
    parts([
      ...entries,
      archetypeOrOptions === self || recordedAs(archetypeOrOptions, 'archetype')
        ? { kind: 'dir', name, paths, archetype: archetypeOrOptions, options }
        : { kind: 'dir', name, paths, options: archetypeOrOptions },
    ]),
});

const handles = (state: RecordedArchetype) =>
  Object.fromEntries(
    (Array.isArray(state.parts) ? (state.parts as RecordedPart[]) : [])
      .filter((part) => typeof part.name === 'string' && !(archetypeMethods as readonly unknown[]).includes(part.name))
      .map((part) => [part.name, Object.freeze(record('partHandle', { archetype: state.name, part: part.name }))]),
  );

const builder = (state: RecordedArchetype): unknown => ({
  ...handles(state),
  name: state.name,
  ...record('archetype', state),
  identify: (identify: unknown) => builder({ ...state, identify }),
  requires: (requires: unknown) => builder({ ...state, requires }),
  contains: (contains: (p: unknown, context: unknown) => unknown) =>
    builder({ ...state, parts: recordedAs(contains(parts([]), { required: requiredRefs(), self }), 'parts') }),
  exposes: (exposes: unknown) => builder({ ...state, exposes }),
  provides: (provides: unknown) => builder({ ...state, provides }),
  description: (description: unknown) => builder({ ...state, description }),
});

export const archetype = <const N extends string>(name: N): ArchetypeBuilder<N, {}, {}, {}> =>
  builder({ name, requires: {}, parts: [] }) as never;

export const dir = (): Shape => Object.freeze(record('shape', 'dir')) as never;

export const files = (): Shape => Object.freeze(record('shape', 'files')) as never;

export const pkg = (pattern: string): Package => ref({ kind: 'package', pattern }) as never;

export const defineConfig = <const C extends WarpConfig>(config: C): C => config;

const rulesetOf = (state: RecordedRuleset): unknown => ({
  ...record('ruleset', state),
  rules: (settings: unknown) => rulesetOf({ ...state, entries: [...state.entries, { settings }] }),
  on: (target: unknown, settings: unknown) =>
    rulesetOf({ ...state, entries: [...state.entries, { target, settings }] }),
  extends: (base: unknown) => {
    if (state.base !== undefined) throw new ConfigError('ruleset().extends: a ruleset extends one base');
    return rulesetOf({ ...state, base });
  },
});

export const ruleset = (): Ruleset => rulesetOf({ entries: [] }) as never;
