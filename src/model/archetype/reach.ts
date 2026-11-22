import type { ArchetypeData, ConfigData, PartRefData, RefData } from './data.ts';
import { show } from './references.ts';
import type { Model, UnitView } from './resolve.ts';

export interface Grant {
  owner: string;
  ref?: string;
  files: ReadonlySet<string>;
}

export const grantText = ({ owner, ref }: Grant): string => (ref === undefined ? owner : `${owner} uses ${ref}`);

export type Refusal = { reason: 'private'; hiddenBy: UnitView } | { reason: 'above' } | { reason: 'not-in-using' };

export type Verdict = { allowed: true; grant: Grant } | ({ allowed: false } & Refusal);

export interface Verdicts {
  reach(file: string): readonly Grant[] | undefined;
  surface(unit: UnitView, name?: string): ReadonlySet<string>;
  verdict(from: string, to: string): Verdict | undefined;
  files(unit: UnitView, ref: RefData): ReadonlySet<string>;
  describe(unit: UnitView, ref: RefData): string;
}

const none: ReadonlySet<string> = new Set();

const union = (sets: Iterable<ReadonlySet<string>>): Set<string> => {
  const all = new Set<string>();
  for (const set of sets) for (const file of set) all.add(file);
  return all;
};

const partName = (unit: UnitView): string => unit.part!.slice(unit.part!.lastIndexOf('.') + 1);

const ancestors = function* (unit: UnitView): Generator<UnitView> {
  for (let at = unit.parent; at; at = at.parent) yield at;
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
    surface: (unit, name) => surface(state, unit, name),
    verdict: (from, to) => verdict(state, from, to),
    files: (unit, ref) => resolve(state, unit, ref),
    describe: (unit, ref) => describe(state, unit, ref),
  };
};

const archetypeOf = ({ config }: State, unit: UnitView): ArchetypeData | undefined =>
  unit.archetype === undefined ? undefined : config.archetypes[unit.archetype];

const surface = (state: State, unit: UnitView, name?: string): ReadonlySet<string> => {
  const key = `${unit.id}\0${name ?? ''}`;
  let files = state.surfaces.get(key);
  if (!files) {
    files = exposed(state, unit, name);
    state.surfaces.set(key, files);
  }
  return files;
};

const exposed = (state: State, unit: UnitView, name: string | undefined): ReadonlySet<string> => {
  const archetype = archetypeOf(state, unit);
  if (!archetype) return new Set(unit.ownFiles);
  if (!archetype.exposes)
    return union([new Set(unit.ownFiles), ...unit.children.map((child) => surface(state, child))]);
  const refs = name === undefined ? Object.values(archetype.exposes).flat() : (archetype.exposes[name] ?? []);
  return union(refs.map((ref) => resolve(state, unit, ref)));
};

const provider = (state: State, unit: UnitView, name: string): { at: UnitView; ref: PartRefData } | undefined => {
  for (const at of ancestors(unit)) {
    const ref = archetypeOf(state, at)!.provides[name];
    if (ref) return { at, ref };
  }
  return undefined;
};

const resolve = (state: State, unit: UnitView, ref: RefData): ReadonlySet<string> => {
  if (ref.kind === 'package') return none;
  if (ref.kind === 'required') return resolveRequired(state, unit, ref.name, ref.surface);
  const part = archetypeOf(state, unit)!.parts.find((candidate) => candidate.name === ref.part)!;
  if (part.kind === 'files') return new Set(unit.parts[ref.part]);
  return union(
    unit.children.filter((child) => partName(child) === ref.part).map((child) => surface(state, child, ref.surface)),
  );
};

const resolveRequired = (state: State, unit: UnitView, name: string, surface: string | undefined) => {
  const found = provider(state, unit, name)!;
  return resolve(state, found.at, { ...found.ref, surface });
};

const describe = (state: State, unit: UnitView, ref: RefData): string => {
  if (ref.kind === 'part') return `s.${show(ref)}`;
  if (ref.kind === 'package') return show(ref);
  return `${show(ref)} (from ${provider(state, unit, ref.name)!.at.id})`;
};

const grants = (state: State, unit: UnitView, owner: string, refs: readonly RefData[]): Grant[] =>
  refs.map((ref) => ({ owner, ref: describe(state, unit, ref), files: resolve(state, unit, ref) }));

const reach = (state: State, file: string): readonly Grant[] | undefined => {
  const unit = state.model.unitOf(file);
  const part = state.model.partOf(file);
  if (!unit || (unit.archetype !== undefined && part === undefined)) return undefined;
  const key = `${unit.id}\0${part ?? ''}`;
  let found = state.reaches.get(key);
  if (!found) {
    found = [...ownReach(state, unit, part), ...dirPartReach(state, unit)];
    state.reaches.set(key, found);
  }
  return found;
};

const ownReach = (state: State, unit: UnitView, part: string | undefined): Grant[] => {
  if (part === undefined) return [{ owner: `own folder ${unit.id}`, files: new Set(unit.ownFiles) }];
  const using = archetypeOf(state, unit)!.parts.find((candidate) => candidate.name === part)!.using;
  return [{ owner: `own part ${part}`, files: new Set(unit.parts[part]) }, ...grants(state, unit, part, using)];
};

const dirPartReach = (state: State, unit: UnitView): Grant[] => {
  if (!unit.parent) return [];
  const parent = archetypeOf(state, unit.parent)!;
  const dirPart = parent.parts.find((candidate) => candidate.name === partName(unit))!;
  return grants(state, unit.parent, `${parent.name}.${dirPart.name}`, dirPart.using);
};

const verdict = (state: State, from: string, to: string): Verdict | undefined => {
  const granted = reach(state, from);
  const target = state.model.unitOf(to);
  if (!granted || !target) return undefined;
  const grant = granted.find((candidate) => candidate.files.has(to));
  if (grant) return { allowed: true, grant };
  return { allowed: false, ...refusal(state, state.model.unitOf(from)!, target, to) };
};

const refusal = (state: State, source: UnitView, target: UnitView, to: string): Refusal => {
  const above = new Set(ancestors(source));
  if (above.has(target)) return { reason: 'above' };
  for (let at = target; !above.has(at) && at !== source; at = at.parent!) {
    if (!surface(state, at).has(to)) return { reason: 'private', hiddenBy: at };
  }
  return { reason: 'not-in-using' };
};
