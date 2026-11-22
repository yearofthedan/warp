import type { IdentifyData, Loose } from './data.ts';

declare const referenceBrand: unique symbol;
declare const packageBrand: unique symbol;
declare const shapeBrand: unique symbol;
declare const selfBrand: unique symbol;
declare const inlineBrand: unique symbol;
declare const exposesType: unique symbol;

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

export interface InlineRule {
  readonly [inlineBrand]: true;
}

export type RuleSettings = 'off' | Record<string, boolean | InlineRule | object>;

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
  rules?: RuleSettings;
  description?: string;
}

type NewName<K extends string, C> = K extends keyof C ? `part '${K}' is already declared` : K;

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

export interface ArchetypeBuilder<N extends string, C, R, E> extends Archetype<N, E> {
  identify(identify: Identify): ArchetypeBuilder<N, C, R, E>;
  requires<const R2 extends Record<string, AnyArchetype | Shape>>(
    requires: R2,
  ): ArchetypeBuilder<N, C, { readonly [K in keyof R2]: UnitsRef<R2[K]> }, E>;
  contains<C2>(parts: (p: Parts<{}>, context: ContainsContext<R>) => Parts<C2>): ArchetypeBuilder<N, C2, R, E>;
  exposes<const E2 extends Record<string, Reference | readonly Reference[]>>(
    exposes: (s: C) => E2,
  ): ArchetypeBuilder<N, C, R, E2>;
  provides(provides: (s: C) => Record<string, Reference>): ArchetypeBuilder<N, C, R, E>;
  loose(loose: Loose): ArchetypeBuilder<N, C, R, E>;
  rules(rules: RuleSettings | ((s: C, context: { required: R }) => RuleSettings)): ArchetypeBuilder<N, C, R, E>;
  description(description: string): ArchetypeBuilder<N, C, R, E>;
}

export interface ArchetypeConfig {
  root: AnyArchetype;
  tsconfig?: string | readonly string[];
  plugins?: Record<string, unknown>;
  rules?: RuleSettings;
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
  loose?: unknown;
  rules?: unknown;
  description?: unknown;
}

interface Recorded {
  ref: RecordedRef;
  self: true;
  shape: 'dir' | 'files';
  inline: { kind: 'mustImport'; from: unknown; to: unknown };
  parts: readonly RecordedPart[];
  archetype: RecordedArchetype;
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

const builder = (state: RecordedArchetype): unknown => ({
  name: state.name,
  ...record('archetype', state),
  identify: (identify: unknown) => builder({ ...state, identify }),
  requires: (requires: unknown) => builder({ ...state, requires }),
  contains: (contains: (p: unknown, context: unknown) => unknown) =>
    builder({ ...state, parts: recordedAs(contains(parts([]), { required: requiredRefs(), self }), 'parts') }),
  exposes: (exposes: unknown) => builder({ ...state, exposes }),
  provides: (provides: unknown) => builder({ ...state, provides }),
  loose: (loose: unknown) => builder({ ...state, loose }),
  rules: (rules: unknown) => builder({ ...state, rules }),
  description: (description: unknown) => builder({ ...state, description }),
});

export const archetype = <const N extends string>(name: N): ArchetypeBuilder<N, {}, {}, {}> =>
  builder({ name, requires: {}, parts: [] }) as never;

export const dir = (): Shape => Object.freeze(record('shape', 'dir')) as never;

export const files = (): Shape => Object.freeze(record('shape', 'files')) as never;

export const pkg = (pattern: string): Package => ref({ kind: 'package', pattern }) as never;

export const mustImport = ({ from, to }: { from: Reference; to: Reference }): InlineRule =>
  Object.freeze(record('inline', { kind: 'mustImport', from, to })) as never;
