import type { ConfigData, ExposesData, ModuleRefData, RefData } from './data.ts';
import { show } from './references.ts';
import { declarationOf, fillPattern, globRegex, type Model, type ModuleView } from './resolve.ts';

export interface Grant {
  owner: string;
  ref?: string;
  files: ReadonlySet<string>;
  package?: string;
}

export const grantText = ({ owner, ref }: Grant): string => (ref === undefined ? owner : `${owner} uses ${ref}`);

export type Refusal =
  | { reason: 'private'; hiddenBy: ModuleView }
  | { reason: 'above' }
  | { reason: 'not-in-using' }
  | { reason: 'test' };

export type Verdict = { allowed: true; grant: Grant } | ({ allowed: false } & Refusal);

export interface Verdicts {
  reach(file: string): readonly Grant[] | undefined;
  exposes(module: ModuleView): ExposesData | undefined;
  surface(module: ModuleView, name?: string): ReadonlySet<string>;
  verdict(from: string, to: string): Verdict | undefined;
  files(module: ModuleView, ref: RefData): ReadonlySet<string>;
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
    surface: (module, name) => surface(state, module, name),
    verdict: (from, to) => verdict(state, from, to),
    files: (module, ref) => resolve(state, module, ref),
    describe: (module, ref) => describe(state, module, ref),
  };
};

const exposes = ({ config }: State, module: ModuleView): ExposesData | undefined => {
  if (module.kind === 'dir') return config.archetypes[module.archetype!]!.exposes;
  const declared = declarationOf(config, module);
  return declared?.kind === 'files' ? declared.exposes : undefined;
};

const surface = (state: State, module: ModuleView, name?: string): ReadonlySet<string> => {
  const key = `${module.id}\0${name ?? ''}`;
  let files = state.surfaces.get(key);
  if (!files) {
    files = exposed(state, module, name);
    state.surfaces.set(key, files);
  }
  return files;
};

const exposed = (state: State, module: ModuleView, name: string | undefined): ReadonlySet<string> => {
  const declared = exposes(state, module);
  if (declared === undefined) return none;
  if (declared.kind === 'surfaces') {
    const refs = name === undefined ? Object.values(declared.surfaces).flat() : (declared.surfaces[name] ?? []);
    return union(refs.map((ref) => resolve(state, module, ref)));
  }
  const all = union([new Set(module.files), ...module.children.map((child) => surface(state, child))]);
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

const resolve = (state: State, module: ModuleView, ref: RefData): ReadonlySet<string> => {
  if (ref.kind === 'package') return none;
  if (ref.kind === 'required') return resolveRequired(state, module, ref.name, ref.surface);
  return union(
    module.children.filter((child) => child.name === ref.module).map((child) => surface(state, child, ref.surface)),
  );
};

const resolveRequired = (state: State, module: ModuleView, name: string, surface: string | undefined) => {
  const found = provider(state, module, name)!;
  return resolve(state, found.at, { ...found.ref, surface });
};

const describe = (state: State, module: ModuleView, ref: RefData): string => {
  if (ref.kind === 'module') return `m.${show(ref)}`;
  if (ref.kind === 'package') return show(ref);
  return `${show(ref)} (from ${provider(state, module, ref.name)!.at.id})`;
};

const grants = (state: State, holder: ModuleView, owner: string, refs: readonly RefData[]): Grant[] =>
  refs.map((ref) => ({
    owner,
    ref: describe(state, holder, ref),
    files: resolve(state, holder, ref),
    ...(ref.kind === 'package' ? { package: ref.pattern } : {}),
  }));

const reach = (state: State, file: string): readonly Grant[] | undefined => {
  const module = state.model.moduleOf(file);
  if (!module || module.looseFiles.includes(file)) return undefined;
  if (state.model.isTest(file)) return testReach(state, module);
  let found = state.reaches.get(module.id);
  if (!found) {
    const granted = [{ owner: `own module ${module.id}`, files: new Set(module.files) }, ...using(state, module)];
    if (module.kind === 'files') granted.push(...using(state, module.parent!));
    found = granted;
    state.reaches.set(module.id, found);
  }
  return found;
};

const testReach = (state: State, module: ModuleView): readonly Grant[] => {
  const owner = module.test ? module.parent! : module;
  const key = `tests\0${owner.id}`;
  let found = state.reaches.get(key);
  if (!found) {
    found = owner.kind === 'dir' ? folderTests(state, owner) : filesTests(state, owner);
    state.reaches.set(key, found);
  }
  return found;
};

const folderTests = (state: State, owner: ModuleView): Grant[] => {
  const by = `tests of ${owner.id}`;
  const own = owner.children.filter((child) => child.kind === 'files');
  return [
    {
      owner: by,
      files: union([new Set([...owner.files, ...owner.tests]), ...own.map((child) => new Set(child.files))]),
    },
    ...owner.children
      .filter((child) => child.kind === 'dir')
      .map((child) => ({ owner: by, ref: child.id, files: union([surface(state, child), testSurface(state, child)]) })),
    ...(owner.parent ? using(state, owner) : []),
    ...own.filter((child) => !child.test).flatMap((child) => using(state, child)),
    ...layerUsing(state, owner, owner, by),
    ...[...ancestors(owner)].flatMap((above) => layer(state, above, by)),
  ];
};

const filesTests = (state: State, owner: ModuleView): Grant[] => {
  const by = `tests of ${owner.id}`;
  const folder = owner.parent!;
  const declared = declarationOf(state.config, owner);
  const tests = declared?.kind === 'files' ? declared.tests : undefined;
  return [
    { owner: by, files: new Set([...owner.files, ...owner.tests]) },
    ...using(state, owner),
    ...using(state, folder),
    ...(tests ? grants(state, folder, by, tests.using) : []),
    ...[folder, ...ancestors(folder)].flatMap((above) => layer(state, above, by)),
  ];
};

const layerOf = ({ config }: State, module: ModuleView) =>
  module.archetype === undefined ? undefined : config.archetypes[module.archetype]!.tests;

const layerUsing = (state: State, holder: ModuleView, at: ModuleView, by: string): Grant[] =>
  grants(state, holder, by, layerOf(state, at)?.using ?? []);

const layer = (state: State, above: ModuleView, by: string): Grant[] => {
  const tests = above.children.filter((child) => child.test).map((child) => new Set(child.files));
  return [
    ...(tests.length > 0 ? [{ owner: by, ref: `${above.id} tests`, files: union(tests) }] : []),
    ...layerUsing(state, above, above, by),
  ];
};

const testSurface = (state: State, module: ModuleView): ReadonlySet<string> => {
  const exposes = layerOf(state, module)?.exposes;
  if (!exposes) return none;
  const testModules = module.children.filter((child) => child.test);
  if (exposes.kind !== 'surfaces')
    return union([
      ...testModules.map((child) => new Set(child.files)),
      ...module.children.filter((child) => child.kind === 'dir').map((child) => testSurface(state, child)),
    ]);
  const named = new Set(
    Object.values(exposes.surfaces)
      .flat()
      .flatMap((ref) => (ref.kind === 'module' ? [`tests.${ref.module}`] : [])),
  );
  return union(testModules.filter((child) => named.has(child.name!)).map((child) => new Set(child.files)));
};

const using = (state: State, module: ModuleView): Grant[] => {
  const declared = declarationOf(state.config, module);
  if (!declared) return [];
  const owner = module.kind === 'files' ? declared.name : `${module.parent!.archetype}.${declared.name}`;
  return grants(state, module.parent!, owner, declared.using);
};

const verdict = (state: State, from: string, to: string): Verdict | undefined => {
  const granted = reach(state, from);
  const target = state.model.moduleOf(to);
  if (!granted || !target) return undefined;
  const grant = granted.find((candidate) => candidate.files.has(to));
  if (grant) return { allowed: true, grant };
  if (state.model.isTest(to) && !state.model.isTest(from)) return { allowed: false, reason: 'test' };
  return { allowed: false, ...refusal(state, state.model.moduleOf(from)!, target, from, to) };
};

const refusal = (state: State, source: ModuleView, target: ModuleView, from: string, to: string): Refusal => {
  const above = new Set(ancestors(source));
  if (above.has(target)) return { reason: 'above' };
  if (target.kind === 'files' && target.parent !== source.parent && above.has(target.parent!))
    return { reason: 'above' };
  const tested = state.model.isTest(from);
  const start = target.test ? target.parent! : target;
  for (let at = start; !above.has(at) && at !== source; at = at.parent!) {
    const open = tested ? union([surface(state, at), testSurface(state, at)]) : surface(state, at);
    if (!open.has(to)) return { reason: 'private', hiddenBy: at };
  }
  return { reason: 'not-in-using' };
};
