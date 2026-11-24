import type { ArchetypeData, ConfigData, ExposesData, ModuleData, RefData, RequirementData } from './data.ts';
import { verdicts } from './reach.ts';
import type { Model, ModuleView } from './resolve.ts';

export interface Site {
  label: string;
  holder: ModuleView;
  add(config: ConfigData, ref: RefData): ConfigData;
  visible: ReadonlySet<string>;
  self?: string;
  tests: boolean;
}

export type Fix =
  | { kind: 'using'; site: string; ref: RefData }
  | { kind: 'declare'; archetype: string; module: string; above: string }
  | { kind: 'require'; archetype: string; name: string; provider: string; module: string }
  | { kind: 'expose'; archetype: string; ref: RefData }
  | { kind: 'expose-file'; archetype: string; pattern: string };

interface Change {
  fix: Fix;
  config: ConfigData;
}

const ancestors = function* (module: ModuleView): Generator<ModuleView> {
  for (let at = module.parent; at; at = at.parent) yield at;
};

const lineage = (module: ModuleView): ModuleView[] => [module, ...ancestors(module)];

export const namedArchetype = (config: ConfigData, name: string): string =>
  config.archetypes[name]!.inline ? namedArchetype(config, name.slice(0, name.lastIndexOf('.'))) : name;

const withArchetype = (config: ConfigData, name: string, change: (archetype: ArchetypeData) => ArchetypeData) => ({
  ...config,
  archetypes: { ...config.archetypes, [name]: change(config.archetypes[name]!) },
});

const withModule = (config: ConfigData, archetype: string, name: string, change: (module: ModuleData) => ModuleData) =>
  withArchetype(config, archetype, (data) => ({
    ...data,
    modules: data.modules.map((module) => (module.name === name ? change(module) : module)),
  }));

const declarationSite = (config: ConfigData, module: ModuleView): Site => {
  const holder = module.parent!;
  const archetype = holder.archetype!;
  const declared = config.archetypes[archetype]!.modules;
  const index = declared.findIndex((data) => data.name === module.name);
  return {
    label: `the using of ${archetype}.${module.name}`,
    holder,
    add: (from, ref) =>
      withModule(from, archetype, module.name!, (data) => ({ ...data, using: [...data.using, ref] }) as ModuleData),
    visible: new Set(declared.slice(0, index).map((data) => data.name)),
    self: module.name!,
    tests: module.kind === 'test',
  };
};

const kitSite = (config: ConfigData, at: ModuleView): Site => {
  const archetype = at.archetype!;
  return {
    label: `the testUsing of ${archetype}`,
    holder: at,
    add: (from, ref) =>
      withArchetype(from, archetype, (data) => ({ ...data, testUsing: [...(data.testUsing ?? []), ref] })),
    visible: new Set(config.archetypes[archetype]!.modules.map((data) => data.name)),
    tests: true,
  };
};

export const sitesOf = (config: ConfigData, model: Model, file: string): Site[] => {
  const module = model.moduleOf(file);
  if (!module || module.looseFiles.includes(file)) return [];
  if (module.kind === 'test')
    return [declarationSite(config, module), ...lineage(module.parent!).map((at) => kitSite(config, at))];
  const owners = module.kind === 'files' ? [module, module.parent!] : [module];
  return owners.filter((owner) => owner.parent).map((owner) => declarationSite(config, owner));
};

const surfacesOf = (exposes: ExposesData | undefined): string[] =>
  exposes?.kind === 'surfaces' ? Object.keys(exposes.surfaces) : [];

const moduleRefs = (config: ConfigData, module: ModuleView): RefData[] => {
  const surfaces = module.kind === 'dir' ? surfacesOf(config.archetypes[module.archetype!]!.exposes) : [];
  const name = module.name!;
  return [
    ...surfaces.map((surface): RefData => ({ kind: 'module', module: name, surface })),
    { kind: 'module', module: name },
  ];
};

const requiredRefs = (config: ConfigData, name: string, requirement: RequirementData): RefData[] => {
  const surfaces =
    requirement.kind === 'archetype' ? surfacesOf(config.archetypes[requirement.archetype]!.exposes) : [];
  return [...surfaces.map((surface): RefData => ({ kind: 'required', name, surface })), { kind: 'required', name }];
};

interface Search {
  model: Model;
  from: string;
  to: string;
}

const allowed = ({ model, from, to }: Search, config: ConfigData): boolean =>
  verdicts(config, model).verdict(from, to)!.allowed;

const targetLineage = ({ model, to }: Search): ModuleView[] => lineage(model.moduleOf(to)!);

const sameDeclaration = (a: ModuleView, b: ModuleView): boolean => a.parent === b.parent && a.name === b.name;

const reachable = (search: Search): ModuleView[] => {
  const importer = lineage(search.model.moduleOf(search.from)!);
  return targetLineage(search).filter((module) => !importer.some((own) => sameDeclaration(own, module)));
};

const nameable = (site: Site, module: ModuleView): boolean =>
  module.parent === site.holder && module.name !== site.self && (site.tests || module.kind !== 'test');

const usingChanges = function* (search: Search, config: ConfigData): Generator<Change[]> {
  const targets = reachable(search);
  for (const site of sitesOf(config, search.model, search.from)) {
    const own = targets.filter((module) => nameable(site, module) && site.visible.has(module.name!));
    const named = namedArchetype(config, site.holder.archetype!);
    const required = Object.entries(config.archetypes[named]!.requires).flatMap(([name, requirement]) =>
      requiredRefs(config, name, requirement),
    );
    for (const ref of [...own.flatMap((module) => moduleRefs(config, module)), ...required])
      yield [{ fix: { kind: 'using', site: site.label, ref }, config: site.add(config, ref) }];
  }
};

const declareChanges = function* (search: Search, config: ConfigData): Generator<Change[]> {
  const targets = reachable(search);
  for (const site of sitesOf(config, search.model, search.from))
    for (const module of targets.filter(
      (candidate) => nameable(site, candidate) && !site.visible.has(candidate.name!),
    )) {
      const declared = declare(config, site, module);
      if (!declared) continue;
      for (const ref of moduleRefs(declared.config, module))
        yield [declared, { fix: { kind: 'using', site: site.label, ref }, config: site.add(declared.config, ref) }];
    }
};

const declare = (config: ConfigData, site: Site, module: ModuleView): Change | undefined => {
  if (site.self === undefined) return undefined;
  const archetype = site.holder.archetype!;
  const modules = config.archetypes[archetype]!.modules;
  const moved = modules.find((data) => data.name === module.name)!;
  const sees = moved.using.every((ref) => ref.kind !== 'module' || site.visible.has(ref.module));
  if (!sees) return undefined;
  const rest = modules.filter((data) => data !== moved);
  const at = rest.findIndex((data) => data.name === site.self);
  return {
    fix: { kind: 'declare', archetype, module: module.name!, above: site.self },
    config: withArchetype(config, archetype, (data) => ({
      ...data,
      modules: [...rest.slice(0, at), moved, ...rest.slice(at)],
    })),
  };
};

const providedEverywhere = (config: ConfigData, model: Model, archetype: string, name: string): boolean =>
  model.modules
    .filter((module) => module.archetype !== undefined && namedArchetype(config, module.archetype) === archetype)
    .every((module) => [...ancestors(module)].some((at) => config.archetypes[at.archetype!]!.provides[name]));

const requireChanges = function* (search: Search, config: ConfigData): Generator<Change[]> {
  const targets = reachable(search);
  for (const site of sitesOf(config, search.model, search.from))
    for (const provider of ancestors(site.holder))
      for (const module of targets.filter((target) => target.parent === provider && target.kind !== 'test')) {
        const changes = requirement(search, config, site, provider, module);
        if (changes) yield changes;
      }
};

const requirement = (
  search: Search,
  config: ConfigData,
  site: Site,
  provider: ModuleView,
  module: ModuleView,
): Change[] | undefined => {
  const archetype = namedArchetype(config, site.holder.archetype!);
  const name = module.name!;
  const providing = config.archetypes[provider.archetype!]!.provides[name];
  if (config.archetypes[archetype]!.requires[name] || (providing && providing.module !== name)) return undefined;
  const required = withArchetype(
    withArchetype(config, archetype, (data) => ({
      ...data,
      requires: { ...data.requires, [name]: { kind: module.kind === 'dir' ? 'dir' : 'files' } },
    })),
    provider.archetype!,
    (data) => ({ ...data, provides: { ...data.provides, [name]: { kind: 'module', module: name } } }),
  );
  if (!providedEverywhere(required, search.model, archetype, name)) return undefined;
  const ref: RefData = { kind: 'required', name };
  return [
    { fix: { kind: 'require', archetype, name, provider: provider.archetype!, module: name }, config: required },
    { fix: { kind: 'using', site: site.label, ref }, config: site.add(required, ref) },
  ];
};

const relative = (module: ModuleView, file: string): string =>
  module.dir === '' ? file : file.slice(module.dir.length + 1);

const exposeChange = (search: Search, config: ConfigData, hiddenBy: ModuleView): Change | undefined => {
  if (hiddenBy.kind !== 'dir') return exposeFilesModule(search, config, hiddenBy);
  const archetype = hiddenBy.archetype!;
  const exposes = config.archetypes[archetype]!.exposes;
  const child = targetLineage(search).find((module) => module.parent === hiddenBy);
  if (exposes?.kind === 'surfaces') {
    if (!child) return undefined;
    const ref: RefData = { kind: 'module', module: child.name! };
    const surfaces = { ...exposes.surfaces, [child.name!]: [...(exposes.surfaces[child.name!] ?? []), ref] };
    return {
      fix: { kind: 'expose', archetype, ref },
      config: withArchetype(config, archetype, (data) => ({ ...data, exposes: { kind: 'surfaces', surfaces } })),
    };
  }
  if (exposes?.kind === 'all' || exposes?.entry || child?.kind === 'test') return undefined;
  const pattern = relative(hiddenBy, search.to);
  const opened: ExposesData = { kind: 'files', patterns: [...(exposes?.patterns ?? []), pattern] };
  return {
    fix: { kind: 'expose-file', archetype, pattern },
    config: withArchetype(config, archetype, (data) => ({ ...data, exposes: opened })),
  };
};

const exposeFilesModule = (search: Search, config: ConfigData, hiddenBy: ModuleView): Change | undefined => {
  const archetype = hiddenBy.parent!.archetype!;
  const declared = config.archetypes[archetype]!.modules.find((data) => data.name === hiddenBy.name);
  if (declared?.kind === 'dir') return undefined;
  const exposes = declared!.exposes;
  if (exposes?.kind === 'all') return undefined;
  const pattern = relative(hiddenBy, search.to);
  return {
    fix: { kind: 'expose-file', archetype: `${archetype}.${hiddenBy.name}`, pattern },
    config: withModule(config, archetype, hiddenBy.name!, (data) => ({
      ...data,
      exposes: { kind: 'files', patterns: [...(exposes?.patterns ?? []), pattern] },
    })),
  };
};

const subtree = (module: ModuleView): ModuleView[] => [module, ...module.children.flatMap(subtree)];

const reaches = (config: ConfigData, model: Model, from: ModuleView, to: ModuleView): boolean => {
  const judge = verdicts(config, model);
  const files = new Set(subtree(to).flatMap((module) => module.files));
  return subtree(from).some((module) => {
    const file = module.files[0];
    return file !== undefined && judge.reach(file)!.some((grant) => [...grant.files].some((to) => files.has(to)));
  });
};

const topOf = (module: ModuleView, under: ModuleView): ModuleView => {
  let at = module;
  while (at.parent && at.parent !== under) at = at.parent;
  return at;
};

const loops = ({ model, from, to }: Search, config: ConfigData): boolean => {
  if (model.isTest(from)) return false;
  const source = model.moduleOf(from)!;
  const target = model.moduleOf(to)!;
  const common = [...lineage(source)].find((module) => lineage(target).includes(module));
  if (!common || common === source || common === target) return false;
  return reaches(config, model, topOf(target, common), topOf(source, common));
};

const search = (state: Search, config: ConfigData, fixes: Fix[]): Fix[] | undefined => {
  const verdict = verdicts(config, state.model).verdict(state.from, state.to)!;
  if (verdict.allowed) return fixes;
  if (verdict.reason === 'private') {
    const change = exposeChange(state, config, verdict.hiddenBy);
    return change && search(state, change.config, [...fixes, change.fix]);
  }
  for (const candidates of [usingChanges, declareChanges, requireChanges])
    for (const changes of candidates(state, config)) {
      const changed = changes.at(-1)!.config;
      if (allowed(state, changed) && !loops(state, changed)) return [...fixes, ...changes.map((change) => change.fix)];
    }
  const hidden = hiddenOnTheWay(state, config);
  const change = hidden && exposeChange(state, config, hidden);
  return change && search(state, change.config, [...fixes, change.fix]);
};

const hiddenOnTheWay = ({ model, from, to }: Search, config: ConfigData): ModuleView | undefined => {
  const judge = verdicts(config, model);
  const above = lineage(model.moduleOf(from)!);
  return lineage(model.moduleOf(to)!)
    .filter((module) => !above.includes(module))
    .find((module) => !judge.surface(module).has(to));
};

export const fixesFor = (config: ConfigData, model: Model, from: string, to: string): Fix[] | undefined =>
  search({ model, from, to }, config, []);
