import type { ConfigData, ExposesData, ModuleRefData, RefData } from './data.ts';
import { show } from './references.ts';
import { declarationOf, fillPattern, globRegex, type Model, type ModuleView } from './resolve.ts';

export interface Grant {
  owner: string;
  ref?: string;
  files: ReadonlySet<string>;
  package?: string;
  declared?: RefData;
}

export const grantText = ({ owner, ref }: Grant): string => (ref === undefined ? owner : `${owner} uses ${ref}`);

export type Refusal =
  | { reason: 'private'; hiddenBy: ModuleView }
  | { reason: 'above' }
  | { reason: 'not-in-using' }
  | { reason: 'test' };

export type View = 'production' | 'test';

export type Verdict = { allowed: true; grant: Grant } | ({ allowed: false } & Refusal);

export interface Verdicts {
  reach(file: string): readonly Grant[] | undefined;
  exposes(module: ModuleView): ExposesData | undefined;
  surface(module: ModuleView, name?: string, view?: View): ReadonlySet<string>;
  verdict(from: string, to: string): Verdict | undefined;
  files(module: ModuleView, ref: RefData, view?: View): ReadonlySet<string>;
  describe(module: ModuleView, ref: RefData): string;
}

const none: ReadonlySet<string> = new Set();

const union = (sets: Iterable<ReadonlySet<string>>): Set<string> => {
  const all = new Set<string>();
  for (const set of sets) for (const file of set) all.add(file);
  return all;
};

const ancestors = function* (module: ModuleView): Generator<ModuleView> {
  for (let at = module.parent; at; at = at.parent) yield at;
};

interface State {
  config: ConfigData;
  model: Model;
  surfaces: Map<string, ReadonlySet<string>>;
  reaches: Map<string, readonly Grant[]>;
}

export const verdicts = (config: ConfigData, model: Model): Verdicts => {
  const state: State = { config, model, surfaces: new Map(), reaches: new Map() };
  return {
    reach: (file) => reach(state, file),
    exposes: (module) => exposes(state, module),
    surface: (module, name, view = 'production') => surface(state, module, name, view),
    verdict: (from, to) => verdict(state, from, to),
    files: (module, ref, view = 'production') => resolve(state, module, ref, view),
    describe: (module, ref) => describe(state, module, ref),
  };
};

const exposes = ({ config }: State, module: ModuleView): ExposesData | undefined => {
  if (module.kind === 'dir')
    return config.archetypes[module.archetype!]!.exposes ?? (module.test ? { kind: 'all' } : undefined);
  const declared = declarationOf(config, module);
  if (declared?.kind === 'test') return declared.exposes ?? { kind: 'all' };
  return declared?.kind === 'files' ? declared.exposes : undefined;
};

const testExposes = ({ config }: State, module: ModuleView): Record<string, RefData[]> =>
  (module.kind === 'dir' && config.archetypes[module.archetype!]!.testExposes) || {};

const surface = (state: State, module: ModuleView, name: string | undefined, view: View): ReadonlySet<string> => {
  const key = `${module.id}\0${name ?? ''}\0${view}`;
  let files = state.surfaces.get(key);
  if (!files) {
    files = view === 'test' ? testSurface(state, module, name) : exposed(state, module, name);
    state.surfaces.set(key, files);
  }
  return files;
};

const testSurface = (state: State, module: ModuleView, name: string | undefined): ReadonlySet<string> => {
  const declared = testExposes(state, module);
  const refs = name === undefined ? Object.values(declared).flat() : (declared[name] ?? []);
  const production = name === undefined || !(name in declared) || isSurface(state, module, name);
  return union([
    production ? surface(state, module, name, 'production') : none,
    ...refs.map((ref) => resolve(state, module, ref, 'test')),
  ]);
};

const isSurface = (state: State, module: ModuleView, name: string): boolean => {
  const declared = exposes(state, module);
  return declared?.kind === 'surfaces' && name in declared.surfaces;
};

const exposed = (state: State, module: ModuleView, name: string | undefined): ReadonlySet<string> => {
  const declared = exposes(state, module);
  if (declared === undefined) return none;
  if (declared.kind === 'surfaces') {
    const refs = name === undefined ? Object.values(declared.surfaces).flat() : (declared.surfaces[name] ?? []);
    return union(refs.map((ref) => resolve(state, module, ref, 'production')));
  }
  const all = union([
    new Set(module.files),
    ...module.children
      .filter((child) => module.test || !child.test)
      .map((child) => surface(state, child, undefined, 'production')),
  ]);
  if (declared.kind === 'all') return all;
  const patterns = declared.patterns.flatMap((pattern) => fillPattern(pattern, module.captures) ?? []);
  const inside = (file: string) => (module.dir === '' ? file : file.slice(module.dir.length + 1));
  return new Set([...all].filter((file) => patterns.some((pattern) => globRegex(pattern).test(inside(file)))));
};

const provider = (
  state: State,
  module: ModuleView,
  name: string,
): { at: ModuleView; ref: ModuleRefData } | undefined => {
  for (const at of ancestors(module)) {
    const ref = state.config.archetypes[at.archetype!]!.provides[name];
    if (ref) return { at, ref };
  }
  return undefined;
};

const resolve = (state: State, module: ModuleView, ref: RefData, view: View): ReadonlySet<string> => {
  if (ref.kind === 'package') return none;
  if (ref.kind === 'required') {
    const found = provider(state, module, ref.name)!;
    return resolve(state, found.at, { ...found.ref, surface: ref.surface }, view);
  }
  return union(
    module.children
      .filter((child) => child.name === ref.module)
      .map((child) => surface(state, child, ref.surface, view)),
  );
};

const describe = (state: State, module: ModuleView, ref: RefData): string => {
  if (ref.kind === 'module') return `m.${show(ref)}`;
  if (ref.kind === 'package') return show(ref);
  return `${show(ref)} (from ${provider(state, module, ref.name)!.at.id})`;
};

const grants = (state: State, holder: ModuleView, owner: string, refs: readonly RefData[], view: View): Grant[] =>
  refs.map((ref) => ({
    owner,
    ref: describe(state, holder, ref),
    files: resolve(state, holder, ref, view),
    ...(ref.kind === 'package' ? { package: ref.pattern } : {}),
    declared: ref,
  }));

const reach = (state: State, file: string): readonly Grant[] | undefined => {
  const module = state.model.moduleOf(file);
  if (!module || module.looseFiles.includes(file)) return undefined;
  let found = state.reaches.get(module.id);
  if (!found) {
    found = module.test ? testReach(state, module) : productionReach(state, module);
    state.reaches.set(module.id, found);
  }
  return found;
};

const productionReach = (state: State, module: ModuleView): Grant[] => [
  { owner: `own module ${module.id}`, files: new Set(module.files) },
  ...module.children
    .filter((child) => !child.test)
    .map((child) => ({ owner: module.id, ref: child.id, files: surface(state, child, undefined, 'production') })),
  ...using(state, module, 'production'),
  ...(module.kind === 'files' ? using(state, module.parent!, 'production') : []),
];

const testReach = (state: State, module: ModuleView): Grant[] => [
  { owner: `own module ${module.id}`, files: new Set(module.files) },
  ...module.children.map((child) => ({
    owner: module.id,
    ref: child.id,
    files: surface(state, child, undefined, 'test'),
  })),
  ...inherited(state, module),
];

const inherited = (state: State, module: ModuleView): Grant[] => {
  const holder = module.parent!;
  if (holder.test) return [...using(state, module, 'test'), ...inherited(state, holder)];
  const own = holder.children.filter((child) => child.kind === 'files');
  return [
    {
      owner: module.id,
      ref: holder.id,
      files: union([new Set(holder.files), ...own.map((child) => new Set(child.files))]),
    },
    ...holder.children
      .filter((child) => child.kind === 'dir' && !child.test)
      .map((child) => ({ owner: holder.id, ref: child.id, files: surface(state, child, undefined, 'test') })),
    ...using(state, holder, 'test'),
    ...own.flatMap((child) => using(state, child, 'test')),
    ...using(state, module, 'test'),
    ...[holder, ...ancestors(holder)].flatMap((at) => testKit(state, at)),
  ];
};

const testKit = (state: State, at: ModuleView): Grant[] =>
  grants(state, at, `${at.archetype}.testUsing`, state.config.archetypes[at.archetype!]!.testUsing ?? [], 'test');

const using = (state: State, module: ModuleView, view: View): Grant[] => {
  const declared = declarationOf(state.config, module);
  if (!declared) return [];
  const owner = module.kind === 'dir' ? `${module.parent!.archetype}.${declared.name}` : declared.name;
  return grants(state, module.parent!, owner, declared.using, view);
};

const verdict = (state: State, from: string, to: string): Verdict | undefined => {
  const granted = reach(state, from);
  const target = state.model.moduleOf(to);
  if (!granted || !target) return undefined;
  if (state.model.isTest(to) && !state.model.isTest(from)) return { allowed: false, reason: 'test' };
  const grant = granted.find((candidate) => candidate.files.has(to));
  if (grant) return { allowed: true, grant };
  const view = state.model.isTest(from) ? 'test' : 'production';
  return { allowed: false, ...refusal(state, state.model.moduleOf(from)!, target, to, view) };
};

const refusal = (state: State, source: ModuleView, target: ModuleView, to: string, view: View): Refusal => {
  const above = new Set(ancestors(source));
  if (above.has(target)) return { reason: 'above' };
  if (target.kind !== 'dir' && target.parent !== source.parent && above.has(target.parent!)) return { reason: 'above' };
  for (let at = target; !above.has(at) && at !== source; at = at.parent!)
    if (!surface(state, at, undefined, view).has(to)) return { reason: 'private', hiddenBy: at };
  return { reason: 'not-in-using' };
};
