import { ConfigError } from '../configError.ts';
import type { IdentifyData } from './data.ts';

declare const referenceBrand: unique symbol;
declare const packageBrand: unique symbol;
declare const shapeBrand: unique symbol;
declare const selectorBrand: unique symbol;
declare const selfBrand: unique symbol;
declare const exposesType: unique symbol;
declare const usingType: unique symbol;
declare const modulesType: unique symbol;
declare const allBrand: unique symbol;
declare const handleBrand: unique symbol;
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

export interface Selector<K extends 'dir' | 'files' = 'dir' | 'files'> {
  readonly [selectorBrand]: K;
}

export interface Self {
  readonly [selfBrand]: true;
}

export interface ModuleHandle {
  readonly [handleBrand]: true;
}

export type RuleSettings = 'off' | Record<string, boolean | object>;

export interface All {
  readonly [allBrand]: true;
}

export interface Archetype<N extends string | undefined = string, E = unknown, P = unknown, H = unknown> {
  readonly name: N;
  readonly [exposesType]?: E;
  readonly [usingType]?: (s: P) => void;
  readonly [modulesType]?: H;
}

export type AnyArchetype = Archetype<any, any, any, any>;

export type SurfaceRefs<E> = Reference & { readonly [K in keyof E]: Reference };
type AnySurface = Reference & { readonly [surface: string]: Reference };

type RequiredRef<A> = A extends Archetype<string, infer E> ? SurfaceRefs<E> : Reference;

export type Using<P> = readonly (Reference | Package)[] | ((s: P) => readonly (Reference | Package)[]);

type Surfaces = Record<string, Reference | readonly Reference[]>;

export type Exposed = All | Selector<'files'>;

type NewName<K extends string, C> = K extends keyof C ? `module '${K}' is already declared` : K;

type With<C, K extends string, T> = C & { readonly [k in K]: T };

type HandleOf<N, H> = N extends string
  ? ModuleHandle
  : {} extends H
    ? ModuleHandle
    : ModuleHandle & { readonly modules: H };

export interface Modules<C, H> {
  module<const K extends string>(
    name: NewName<K, C>,
    selector: Selector<'files'>,
    archetype?: Archetype<undefined, {}, C, {}>,
  ): Modules<With<C, K, Reference>, With<H, K, ModuleHandle>>;
  module<const K extends string>(
    name: NewName<K, C>,
    selector: Selector<'dir'>,
    archetype: Self,
  ): Modules<With<C, K, AnySurface>, With<H, K, ModuleHandle>>;
  module<const K extends string, N extends string | undefined = undefined, E = {}, H2 = {}>(
    name: NewName<K, C>,
    selector: Selector<'dir'>,
    archetype?: Archetype<N, E, C, H2>,
  ): Modules<With<C, K, SurfaceRefs<E>>, With<H, K, HandleOf<N, H2>>>;
}

export interface ContainsContext<R> {
  required: R;
  self: Self;
}

export type Identify = IdentifyData;

export type ArchetypeBuilder<N extends string | undefined, C, H, R, E, P = unknown> = ArchetypeMethods<
  N,
  C,
  H,
  R,
  E,
  P
> & { readonly modules: H };

export interface ArchetypeMethods<N extends string | undefined, C, H, R, E, P> extends Archetype<N, E, P, H> {
  identify(identify: Identify): ArchetypeBuilder<N, C, H, R, E, P>;
  requires<const R2 extends Record<string, AnyArchetype | Shape>>(
    requires: R2,
  ): ArchetypeBuilder<N, C, H, { readonly [K in keyof R2]: RequiredRef<R2[K]> }, E, P>;
  contains<C2, H2>(
    modules: (m: Modules<{}, {}>, context: ContainsContext<R>) => Modules<C2, H2>,
  ): ArchetypeBuilder<N, C2, H2, R, E, P>;
  exposes<const E2 extends Surfaces>(exposes: (s: C) => E2): ArchetypeBuilder<N, C, H, R, E2, P>;
  exposes(exposes: Exposed): ArchetypeBuilder<N, C, H, R, {}, P>;
  provides(provides: (s: C) => Record<string, Reference>): ArchetypeBuilder<N, C, H, R, E, P>;
  description(description: string): ArchetypeBuilder<N, C, H, R, E, P>;
  using<P2 = any>(using: Using<P2>): ArchetypeBuilder<N, C, H, R, E, P2>;
}

export interface Ruleset {
  readonly [rulesetBrand]: true;
  rules(settings: RuleSettings): Ruleset;
  on(target: Archetype<string, any, any, any> | ModuleHandle, settings: RuleSettings): Ruleset;
  extends(base: Ruleset): Ruleset;
}

export interface WarpConfig {
  root: Archetype<string, any, any, any>;
  tsconfig?: string | readonly string[];
  plugins?: Record<string, unknown>;
  rulesets?: Record<string, Ruleset>;
}

const recorded = Symbol('warp.recorded');

export type RecordedRef =
  | { kind: 'module'; module: string; surface?: string }
  | { kind: 'required'; name: string; surface?: string }
  | { kind: 'package'; pattern: string };

export interface RecordedSelector {
  kind: 'dir' | 'files';
  patterns: readonly unknown[];
}

export interface RecordedModule {
  name: unknown;
  selector: unknown;
  archetype?: unknown;
  extra: readonly unknown[];
}

export interface RecordedDefinition {
  name: unknown;
  identify?: unknown;
  requires: unknown;
  modules: unknown;
  exposes?: unknown;
  provides?: unknown;
  description?: unknown;
}

export interface RecordedArchetype {
  definition: RecordedDefinition;
  using?: unknown;
}

export interface RecordedRuleset {
  base?: unknown;
  entries: readonly { target?: unknown; settings: unknown }[];
}

interface Recorded {
  ref: RecordedRef;
  self: true;
  all: true;
  shape: 'dir' | 'files';
  selector: RecordedSelector;
  modules: readonly RecordedModule[];
  archetype: RecordedArchetype;
  handle: { archetype: unknown; module: unknown };
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

export const moduleRefs = (): unknown => names((module) => ({ kind: 'module', module }));
export const requiredRefs = (): unknown => names((name) => ({ kind: 'required', name }));

export const self: Self = Object.freeze(record('self', true)) as never;

const modules = (entries: readonly RecordedModule[]): unknown => ({
  ...record('modules', entries),
  module: (name: unknown, selector: unknown, archetype?: unknown, ...extra: unknown[]) =>
    modules([...entries, { name, selector, archetype, extra }]),
});

export const inlineName = (holder: string, module: string): string => `${holder}.${module}`;

const handles = (holder: unknown, entries: unknown): Record<string, unknown> =>
  Object.fromEntries(
    (Array.isArray(entries) ? (entries as RecordedModule[]) : [])
      .filter((entry) => typeof entry.name === 'string')
      .map((entry) => {
        const handle = record('handle', { archetype: holder, module: entry.name });
        const anonymous = recordedAs(entry.archetype, 'archetype')?.definition;
        const nested =
          anonymous && anonymous.name === undefined
            ? { modules: handles(inlineName(String(holder), entry.name as string), anonymous.modules) }
            : {};
        return [entry.name, Object.freeze({ ...handle, ...nested })];
      }),
  );

const builder = (state: RecordedArchetype): unknown => {
  const { definition } = state;
  const define = (field: keyof RecordedDefinition) => (value: unknown) =>
    builder({ ...state, definition: { ...definition, [field]: value } });
  return {
    modules: handles(definition.name, definition.modules),
    name: definition.name,
    ...record('archetype', state),
    identify: define('identify'),
    requires: define('requires'),
    contains: (contains: (m: unknown, context: unknown) => unknown) =>
      define('modules')(recordedAs(contains(modules([]), { required: requiredRefs(), self }), 'modules')),
    exposes: define('exposes'),
    provides: define('provides'),
    description: define('description'),
    using: (using: unknown) => builder({ ...state, using }),
  };
};

const start = (name: unknown): unknown => builder({ definition: { name, requires: {}, modules: [] } });

export function archetype(): ArchetypeBuilder<undefined, {}, {}, {}, {}>;
export function archetype<const N extends string>(name: N): ArchetypeBuilder<N, {}, {}, {}, {}>;
export function archetype(name?: string): unknown {
  return start(name);
}

export const using = <P = any>(using: Using<P>): ArchetypeBuilder<undefined, {}, {}, {}, {}, P> =>
  (start(undefined) as ArchetypeBuilder<undefined, {}, {}, {}, {}>).using(using);

export const exposes = (exposes: Exposed): ArchetypeBuilder<undefined, {}, {}, {}, {}> =>
  (start(undefined) as ArchetypeBuilder<undefined, {}, {}, {}, {}>).exposes(exposes);

export const all = (): All => Object.freeze(record('all', true)) as never;

const selector = (kind: 'dir' | 'files', patterns: readonly unknown[]): unknown =>
  Object.freeze(patterns.length === 0 ? record('shape', kind) : record('selector', { kind, patterns }));

export function dir(): Shape;
export function dir(...paths: [string, ...string[]]): Selector<'dir'>;
export function dir(...paths: string[]): Shape | Selector<'dir'> {
  return selector('dir', paths) as never;
}

export function files(): Shape;
export function files(...patterns: [string, ...string[]]): Selector<'files'>;
export function files(...patterns: string[]): Shape | Selector<'files'> {
  return selector('files', patterns) as never;
}

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
