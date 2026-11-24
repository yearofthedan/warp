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
  if (declared?.kind === 'test') return declared.exposes ?? { kind: 'all' };
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
  const all = union([
    new Set(module.files),
    ...module.children.filter((child) => child.kind !== 'test').map((child) => surface(state, child)),
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
    declared: ref,
  }));

const reach = (state: State, file: string): readonly Grant[] | undefined => {
  const module = state.model.moduleOf(file);
  if (!module || module.looseFiles.includes(file)) return undefined;
  let found = state.reaches.get(module.id);
  if (!found) {
    found = module.kind === 'test' ? testReach(state, module) : productionReach(state, module);
    state.reaches.set(module.id, found);
  }
  return found;
};

const productionReach = (state: State, module: ModuleView): Grant[] => [
  { owner: `own module ${module.id}`, files: new Set(module.files) },
  ...module.children
    .filter((child) => child.kind !== 'test')
    .map((child) => ({ owner: module.id, ref: child.id, files: surface(state, child) })),
  ...using(state, module),
  ...(module.kind === 'files' ? using(state, module.parent!) : []),
];

const testReach = (state: State, module: ModuleView): Grant[] => {
  const holder = module.parent!;
  const own = holder.children.filter((child) => child.kind === 'files');
  return [
    { owner: `own module ${module.id}`, files: new Set(module.files) },
    {
      owner: module.id,
      ref: holder.id,
      files: union([new Set(holder.files), ...own.map((child) => new Set(child.files))]),
    },
    ...holder.children
      .filter((child) => child.kind === 'dir')
      .map((child) => ({ owner: holder.id, ref: child.id, files: surface(state, child) })),
    ...using(state, holder),
    ...own.flatMap((child) => using(state, child)),
    ...using(state, module),
    ...[holder, ...ancestors(holder)].flatMap((at) => testKit(state, at)),
  ];
};

const testKit = (state: State, at: ModuleView): Grant[] =>
  grants(state, at, `${at.archetype}.testUsing`, state.config.archetypes[at.archetype!]!.testUsing ?? []);

const using = (state: State, module: ModuleView): Grant[] => {
  const declared = declarationOf(state.config, module);
  if (!declared) return [];
  const owner = module.kind === 'dir' ? `${module.parent!.archetype}.${declared.name}` : declared.name;
  return grants(state, module.parent!, owner, declared.using);
};

const verdict = (state: State, from: string, to: string): Verdict | undefined => {
  const granted = reach(state, from);
  const target = state.model.moduleOf(to);
  if (!granted || !target) return undefined;
  if (state.model.isTest(to) && !state.model.isTest(from)) return { allowed: false, reason: 'test' };
  const grant = granted.find((candidate) => candidate.files.has(to));
  if (grant) return { allowed: true, grant };
  return { allowed: false, ...refusal(state, state.model.moduleOf(from)!, target, from, to) };
};

const refusal = (state: State, source: ModuleView, target: ModuleView, from: string, to: string): Refusal => {
  const above = new Set(ancestors(source));
  if (above.has(target)) return { reason: 'above' };
  if (target.kind !== 'dir' && target.parent !== source.parent && above.has(target.parent!)) return { reason: 'above' };
  for (let at = target; !above.has(at) && at !== source; at = at.parent!)
    if (!surface(state, at).has(to)) return { reason: 'private', hiddenBy: at };
  return { reason: 'not-in-using' };
};
