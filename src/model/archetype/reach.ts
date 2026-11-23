import type { ArchetypeData, ConfigData, PartRefData, RefData } from './data.ts';
import { show } from './references.ts';
import type { Model, ModuleView } from './resolve.ts';

export interface Grant {
  owner: string;
  ref?: string;
  files: ReadonlySet<string>;
  package?: string;
}

export const grantText = ({ owner, ref }: Grant): string => (ref === undefined ? owner : `${owner} uses ${ref}`);

export type Refusal = { reason: 'private'; hiddenBy: ModuleView } | { reason: 'above' } | { reason: 'not-in-using' };

export type Verdict = { allowed: true; grant: Grant } | ({ allowed: false } & Refusal);

export interface Verdicts {
  reach(file: string): readonly Grant[] | undefined;
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

const partName = (module: ModuleView): string => module.part!.slice(module.part!.lastIndexOf('.') + 1);

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
    surface: (module, name) => surface(state, module, name),
    verdict: (from, to) => verdict(state, from, to),
    files: (module, ref) => resolve(state, module, ref),
    describe: (module, ref) => describe(state, module, ref),
  };
};

const archetypeOf = ({ config }: State, module: ModuleView): ArchetypeData | undefined =>
  module.archetype === undefined ? undefined : config.archetypes[module.archetype];

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
  const archetype = archetypeOf(state, module);
  if (!archetype) return new Set(module.ownFiles);
  if (!archetype.exposes)
    return union([new Set(module.ownFiles), ...module.children.map((child) => surface(state, child))]);
  const refs = name === undefined ? Object.values(archetype.exposes).flat() : (archetype.exposes[name] ?? []);
  return union(refs.map((ref) => resolve(state, module, ref)));
};

const provider = (state: State, module: ModuleView, name: string): { at: ModuleView; ref: PartRefData } | undefined => {
  for (const at of ancestors(module)) {
    const ref = archetypeOf(state, at)!.provides[name];
    if (ref) return { at, ref };
  }
  return undefined;
};

const resolve = (state: State, module: ModuleView, ref: RefData): ReadonlySet<string> => {
  if (ref.kind === 'package') return none;
  if (ref.kind === 'required') return resolveRequired(state, module, ref.name, ref.surface);
  const part = archetypeOf(state, module)!.parts.find((candidate) => candidate.name === ref.part)!;
  if (part.kind === 'files') return new Set(module.parts[ref.part]);
  return union(
    module.children.filter((child) => partName(child) === ref.part).map((child) => surface(state, child, ref.surface)),
  );
};

const resolveRequired = (state: State, module: ModuleView, name: string, surface: string | undefined) => {
  const found = provider(state, module, name)!;
  return resolve(state, found.at, { ...found.ref, surface });
};

const describe = (state: State, module: ModuleView, ref: RefData): string => {
  if (ref.kind === 'part') return `s.${show(ref)}`;
  if (ref.kind === 'package') return show(ref);
  return `${show(ref)} (from ${provider(state, module, ref.name)!.at.id})`;
};

const grants = (state: State, module: ModuleView, owner: string, refs: readonly RefData[]): Grant[] =>
  refs.map((ref) => ({
    owner,
    ref: describe(state, module, ref),
    files: resolve(state, module, ref),
    ...(ref.kind === 'package' ? { package: ref.pattern } : {}),
  }));

const reach = (state: State, file: string): readonly Grant[] | undefined => {
  const module = state.model.moduleOf(file);
  const part = state.model.partOf(file);
  if (!module || (module.archetype !== undefined && part === undefined)) return undefined;
  const key = `${module.id}\0${part ?? ''}`;
  let found = state.reaches.get(key);
  if (!found) {
    found = [...ownReach(state, module, part), ...dirPartReach(state, module)];
    state.reaches.set(key, found);
  }
  return found;
};

const ownReach = (state: State, module: ModuleView, part: string | undefined): Grant[] => {
  if (part === undefined) return [{ owner: `own folder ${module.id}`, files: new Set(module.ownFiles) }];
  const using = archetypeOf(state, module)!.parts.find((candidate) => candidate.name === part)!.using;
  return [{ owner: `own part ${part}`, files: new Set(module.parts[part]) }, ...grants(state, module, part, using)];
};

const dirPartReach = (state: State, module: ModuleView): Grant[] => {
  if (!module.parent) return [];
  const parent = archetypeOf(state, module.parent)!;
  const dirPart = parent.parts.find((candidate) => candidate.name === partName(module))!;
  return grants(state, module.parent, `${parent.name}.${dirPart.name}`, dirPart.using);
};

const verdict = (state: State, from: string, to: string): Verdict | undefined => {
  const granted = reach(state, from);
  const target = state.model.moduleOf(to);
  if (!granted || !target) return undefined;
  const grant = granted.find((candidate) => candidate.files.has(to));
  if (grant) return { allowed: true, grant };
  return { allowed: false, ...refusal(state, state.model.moduleOf(from)!, target, to) };
};

const refusal = (state: State, source: ModuleView, target: ModuleView, to: string): Refusal => {
  const above = new Set(ancestors(source));
  if (above.has(target)) return { reason: 'above' };
  for (let at = target; !above.has(at) && at !== source; at = at.parent!) {
    if (!surface(state, at).has(to)) return { reason: 'private', hiddenBy: at };
  }
  return { reason: 'not-in-using' };
};
