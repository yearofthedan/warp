/**
 * The typed builders a warp.config.ts writes its archetypes with. Each step records what it was given; load.ts runs
 * the callbacks, checks every reference and turns the result into plain data (data.ts).
 *
 * The types catch what they can: misspelt parts, parts declared further down, undeclared requirements and unknown
 * surfaces, each with completions. Self surfaces (`s.subcomponent.render` on a part built from `self`) accept any
 * name, since the archetype's surfaces come from its own `.exposes()`; the load-time check covers them.
 */
import type { IdentifyData, Loose } from './data.ts';

declare const referenceBrand: unique symbol;
declare const packageBrand: unique symbol;
declare const shapeBrand: unique symbol;
declare const selfBrand: unique symbol;
declare const inlineBrand: unique symbol;
declare const exposesType: unique symbol;

/** A part, a requirement, or one of their surfaces. */
export interface Reference {
  readonly [referenceBrand]: true;
}

/** External packages, for `using`: `pkg('vitest')`, `pkg('node:*')`. */
export interface Package {
  readonly [packageBrand]: true;
}

/** A required part with no archetype: `dir()` or `files()`. */
export interface Shape {
  readonly [shapeBrand]: 'dir' | 'files';
}

/** The archetype being defined, for a dir part whose units are of the same archetype. */
export interface Self {
  readonly [selfBrand]: true;
}

/** A rule given by value under a local name, such as `mustImport(...)`. */
export interface InlineRule {
  readonly [inlineBrand]: true;
}

export type RuleSettings = 'off' | Record<string, boolean | InlineRule | object>;

/** An archetype as a parent sees it: its name, and the surfaces E it exposes. */
export interface Archetype<N extends string = string, E = unknown> {
  readonly name: N;
  readonly [exposesType]?: E;
}

// Each archetype's surfaces have their own type, which `unknown` in the second slot would refuse.
export type AnyArchetype = Archetype<string, any>;

/** A dir part or a requirement whose archetype exposes E: usable whole, or one surface at a time. */
export type SurfaceRefs<E> = Reference & { readonly [K in keyof E]: Reference };
type AnySurface = Reference & { readonly [surface: string]: Reference };

/** How a parent references a dir part's units of archetype A. */
type UnitsRef<A> = A extends Self ? AnySurface : A extends Archetype<string, infer E> ? SurfaceRefs<E> : Reference;

/** `C` is `s` in a callback: the parts declared so far. */
export type Using<C> = readonly (Reference | Package)[] | ((s: C) => readonly (Reference | Package)[]);

export interface PartOptions<C> {
  /** What the part's files may import, beyond the other files of their own part. */
  using?: Using<C>;
  rules?: RuleSettings;
  /** For agents choosing where code goes. */
  description?: string;
}

type NewName<K extends string, C> = K extends keyof C ? `part '${K}' is already declared` : K;

/** The parts of an archetype, declared one at a time; each sees only those above it. */
export interface Parts<C> {
  /** A group of the unit's own files. */
  files<const K extends string>(
    name: NewName<K, C>,
    patterns: string | readonly string[],
    options?: PartOptions<C>,
  ): Parts<C & { readonly [k in K]: Reference }>;
  /** A plain unit per matching folder, all of whose files it exposes. */
  dir<const K extends string>(
    name: NewName<K, C>,
    path: string | readonly string[],
    options?: PartOptions<C>,
  ): Parts<C & { readonly [k in K]: Reference }>;
  /** A unit of `archetype` per matching folder. */
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

/**
 * An archetype under construction: C is its parts and R its requirements, as `s` and `required` see them, and E its
 * surfaces. Each step returns a new builder; declare steps in the order listed.
 */
export interface ArchetypeBuilder<N extends string, C, R, E> extends Archetype<N, E> {
  identify(identify: Identify): ArchetypeBuilder<N, C, R, E>;
  /** What the archetype needs from above, answered by the nearest ancestor that provides each name. */
  requires<const R2 extends Record<string, AnyArchetype | Shape>>(
    requires: R2,
  ): ArchetypeBuilder<N, C, { readonly [K in keyof R2]: UnitsRef<R2[K]> }, E>;
  contains<C2>(parts: (p: Parts<{}>, context: ContainsContext<R>) => Parts<C2>): ArchetypeBuilder<N, C2, R, E>;
  /** What a unit offers its parent. Without it, the unit exposes everything. */
  exposes<const E2 extends Record<string, Reference | readonly Reference[]>>(
    exposes: (s: C) => E2,
  ): ArchetypeBuilder<N, C, R, E2>;
  /** Parts offered to anything below that requires them by name. */
  provides(provides: (s: C) => Record<string, Reference>): ArchetypeBuilder<N, C, R, E>;
  /** What happens to a unit's own files that no part matches. Default `allow`; the root's is `deny`. */
  loose(loose: Loose): ArchetypeBuilder<N, C, R, E>;
  rules(rules: RuleSettings | ((s: C, context: { required: R }) => RuleSettings)): ArchetypeBuilder<N, C, R, E>;
  /** For agents choosing where code goes. */
  description(description: string): ArchetypeBuilder<N, C, R, E>;
}

export interface ArchetypeConfig {
  root: AnyArchetype;
  /** The tsconfigs whose programs warp reads, relative to the config. Default `tsconfig.json`. */
  tsconfig?: string | readonly string[];
  plugins?: Record<string, unknown>;
  rules?: RuleSettings;
}

// ---- runtime ----

/** Where a reference, package, shape, inline rule, parts chain or archetype keeps what load.ts reads. */
const recorded = Symbol('warp.recorded');

export type RecordedRef =
  | { kind: 'part'; part: string; surface?: string }
  | { kind: 'required'; name: string; surface?: string }
  | { kind: 'package'; pattern: string };

export type RecordedPart =
  | { kind: 'files'; name: unknown; patterns: unknown; options: unknown }
  /** `archetype` is a builder, `self`, or absent for a plain folder. */
  | { kind: 'dir'; name: unknown; paths: unknown; archetype?: unknown; options: unknown };

export interface RecordedArchetype {
  name: unknown;
  identify?: unknown;
  requires: unknown;
  /** The entries of the parts chain `.contains()` returned. */
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

/** What a builder function recorded on `value` as `type`, or undefined for anything else. */
export const recordedAs = <T extends keyof Recorded>(value: unknown, type: T): Recorded[T] | undefined => {
  const entry = (value as { [recorded]?: { type: unknown; data: Recorded[T] } } | null | undefined)?.[recorded];
  return entry?.type === type ? entry.data : undefined;
};

const ref = (data: RecordedRef) => Object.freeze(record('ref', data));

/** A reference usable whole, or with any property name as one of its surfaces. */
const surfaces = (base: Exclude<RecordedRef, { kind: 'package' }>): unknown =>
  new Proxy(ref(base), {
    get: (target, key) => (typeof key === 'string' ? ref({ ...base, surface: key }) : Reflect.get(target, key)),
  });

const names = (make: (name: string) => Exclude<RecordedRef, { kind: 'package' }>): unknown =>
  new Proxy({}, { get: (_, key) => surfaces(make(String(key))) });

/** `s` for a callback: any part name, any surface. load.ts checks which exist. */
export const partRefs = (): unknown => names((part) => ({ kind: 'part', part }));
/** `required` for a callback. */
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

/** Starts an archetype: a reusable unit type. */
export const archetype = <const N extends string>(name: N): ArchetypeBuilder<N, {}, {}, {}> =>
  builder({ name, requires: {}, parts: [] }) as never;

/** A required plain folder, a part with no archetype. */
export const dir = (): Shape => Object.freeze(record('shape', 'dir')) as never;

/** A required files part. */
export const files = (): Shape => Object.freeze(record('shape', 'files')) as never;

/** External packages for `using`, by name or glob: `pkg('vitest')`, `pkg('node:*')`, `pkg('*')`. */
export const pkg = (pattern: string): Package => ref({ kind: 'package', pattern }) as never;

/** An inline rule: every file in `from` imports something in `to`. */
export const mustImport = ({ from, to }: { from: Reference; to: Reference }): InlineRule =>
  Object.freeze(record('inline', { kind: 'mustImport', from, to })) as never;
