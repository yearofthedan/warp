import type { ArchetypeData, ConfigData, DirModuleData, ExposesData, ModuleData, RefData } from './data.ts';
import { instanceOf, verdicts } from './reach.ts';
import type { Model, ModuleView } from './resolve.ts';

export interface Site {
  label: string;
  holder: ModuleView;
  add(config: ConfigData, ref: RefData): ConfigData;
  self?: string;
  tests: boolean;
}

export type Fix =
  | { kind: 'using'; site: string; ref: RefData }
  | { kind: 'require'; archetype: string; name: string; sites: string[]; module: string }
  | { kind: 'expose'; archetype: string; ref: RefData }
  | { kind: 'test-expose'; archetype: string; ref: RefData }
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
  return {
    label: `${archetype}.${module.name}.dependencies`,
    holder,
    add: (from, ref) =>
      withModule(from, archetype, module.name!, (data) => ({ ...data, using: [...data.using, ref] }) as ModuleData),
    self: module.name!,
    tests: module.test === true,
  };
};

const kitSite = (at: ModuleView): Site => {
  const archetype = at.archetype!;
  return {
    label: `${archetype}.test.provides`,
    holder: at,
    add: (from, ref) =>
      withArchetype(from, archetype, (data) => ({ ...data, testUsing: [...(data.testUsing ?? []), ref] })),
    tests: true,
  };
};

export const sitesOf = (config: ConfigData, model: Model, file: string): Site[] => {
  const module = model.moduleOf(file);
  if (!module || module.looseFiles.includes(file)) return [];
  if (module.test) return lineage(module).map((at) => (at.test ? declarationSite(config, at) : kitSite(at)));
  return module.parent ? [declarationSite(config, module)] : [];
};

const surfacesOf = ({ exposes, testExposes }: ArchetypeData, tests: boolean): string[] => [
  ...new Set([
    ...(exposes?.kind === 'surfaces' ? Object.keys(exposes.surfaces) : []),
    ...(tests ? Object.keys(testExposes ?? {}) : []),
  ]),
];

const moduleRefs = (config: ConfigData, module: ModuleView, tests: boolean, up = 0): RefData[] => {
  const surfaces = module.kind === 'dir' ? surfacesOf(config.archetypes[module.archetype!]!, tests) : [];
  const name = module.name!;
  const out = up > 0 ? { up } : {};
  return [
    ...surfaces.map((surface): RefData => ({ kind: 'module', module: name, surface, ...out })),
    { kind: 'module', module: name, ...out },
  ];
};

const levels = (config: ConfigData, holder: ModuleView): ModuleView[] => {
  const found = [holder];
  for (let at = holder; config.archetypes[at.archetype!]!.inline && at.parent; at = at.parent) found.push(at.parent);
  return found;
};

const inputsOf = (config: ConfigData, site: Site): RefData[] => {
  const named = config.archetypes[namedArchetype(config, site.holder.archetype!)]!;
  const names = [...named.requires, ...(site.tests ? (named.testRequires ?? []) : [])];
  return names.map((name): RefData => ({ kind: 'required', name }));
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
  !(module.parent === site.holder && module.name === site.self) && (site.tests || !module.test);

const usingChanges = function* (search: Search, config: ConfigData): Generator<Change[]> {
  const targets = reachable(search);
  for (const site of sitesOf(config, search.model, search.from)) {
    const own = levels(config, site.holder).flatMap((level, up) =>
      targets
        .filter((module) => module.parent === level && nameable(site, module))
        .flatMap((module) => moduleRefs(config, module, site.tests, up)),
    );
    for (const ref of [...own, ...inputsOf(config, site)])
      yield [{ fix: { kind: 'using', site: site.label, ref }, config: site.add(config, ref) }];
  }
};

interface Use {
  holder: string;
  name: string;
}

const bindingAt = (
  config: ConfigData,
  chain: ReadonlySet<string>,
  { holder }: Use,
  name: string,
): RefData | undefined => {
  if (config.archetypes[holder]!.modules.some((module) => module.name === name))
    return { kind: 'module', module: name };
  return chain.has(namedArchetype(config, holder)) ? { kind: 'required', name } : undefined;
};

const usesOf = (config: ConfigData, archetype: string): Use[] =>
  Object.entries(config.archetypes).flatMap(([holder, data]) =>
    data.modules
      .filter((module) => module.kind === 'dir' && module.archetype === archetype)
      .map((module) => ({ holder, name: module.name })),
  );

const chainTo = (config: ConfigData, holder: ModuleView, target: ModuleView): string[] | undefined => {
  const chain: string[] = [];
  for (
    let instance = instanceOf({ config }, holder);
    instance.parent;
    instance = instanceOf({ config }, instance.parent)
  ) {
    const archetype = instance.archetype!;
    if (config.archetypes[archetype]!.inline) return undefined;
    if (!chain.includes(archetype)) chain.push(archetype);
    if (instance.parent === target.parent) return chain;
  }
  return undefined;
};

const requireChanges = function* (search: Search, config: ConfigData): Generator<Change[]> {
  const targets = reachable(search).filter((target) => !target.test);
  for (const site of sitesOf(config, search.model, search.from))
    for (const module of targets) {
      const chain = chainTo(config, site.holder, module);
      const changes = chain && requirement(config, site, chain, module);
      if (changes) yield changes;
    }
};

const requirement = (
  config: ConfigData,
  site: Site,
  chain: readonly string[],
  module: ModuleView,
): Change[] | undefined => {
  const name = module.name!;
  if (config.archetypes[chain[0]!]!.requires.includes(name)) return undefined;
  const passing = new Set(chain);
  let required = config;
  const fixes: Change[] = [];
  for (const archetype of chain.filter((at) => !config.archetypes[at]!.requires.includes(name))) {
    const uses = usesOf(config, archetype);
    const bindings = uses.map((use) => bindingAt(config, passing, use, name));
    if (bindings.includes(undefined)) return undefined;
    required = withArchetype(required, archetype, (data) => ({ ...data, requires: [...data.requires, name] }));
    for (const [index, use] of uses.entries())
      required = withModule(required, use.holder, use.name, (declared) => {
        const dir = declared as DirModuleData;
        return { ...dir, inputs: { ...dir.inputs, [name]: bindings[index]! } };
      });
    const sites = uses.map((use) => `${use.holder}.${use.name}`);
    fixes.push({ fix: { kind: 'require', archetype, name, sites, module: name }, config: required });
  }
  const ref: RefData = { kind: 'required', name };
  return [...fixes, { fix: { kind: 'using', site: site.label, ref }, config: site.add(required, ref) }];
};

const relative = (module: ModuleView, file: string): string =>
  module.dir === '' ? file : file.slice(module.dir.length + 1);

const exposeChange = (search: Search, config: ConfigData, hiddenBy: ModuleView): Change | undefined => {
  if (hiddenBy.kind !== 'dir') return exposeFilesModule(search, config, hiddenBy);
  if (search.model.isTest(search.to) && !hiddenBy.test) return testExposeChange(search, config, hiddenBy);
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
  if (exposes?.kind === 'all' || exposes?.entry) return undefined;
  const pattern = relative(hiddenBy, search.to);
  const opened: ExposesData = { kind: 'files', patterns: [...(exposes?.patterns ?? []), pattern] };
  return {
    fix: { kind: 'expose-file', archetype, pattern },
    config: withArchetype(config, archetype, (data) => ({ ...data, exposes: opened })),
  };
};

const testExposeChange = (search: Search, config: ConfigData, hiddenBy: ModuleView): Change | undefined => {
  const child = targetLineage(search).find((module) => module.parent === hiddenBy);
  if (!child) return undefined;
  const archetype = hiddenBy.archetype!;
  const ref: RefData = { kind: 'module', module: child.name! };
  const surfaces = config.archetypes[archetype]!.testExposes ?? {};
  const testExposes = { ...surfaces, [child.name!]: [...(surfaces[child.name!] ?? []), ref] };
  return {
    fix: { kind: 'test-expose', archetype, ref },
    config: withArchetype(config, archetype, (data) => ({ ...data, testExposes })),
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

const uses = (config: ConfigData, model: Model, from: ModuleView, under: ModuleView): Set<ModuleView> => {
  const judge = verdicts(config, model);
  const reached = subtree(from).flatMap((module) =>
    module.files.slice(0, 1).flatMap((file) => (judge.reach(file) ?? []).flatMap((grant) => [...grant.files])),
  );
  const found = new Set<ModuleView>();
  for (const to of reached) {
    const target = model.moduleOf(to);
    if (target && lineage(target).includes(under)) found.add(topOf(target, under));
  }
  found.delete(from);
  return found;
};

const reaches = (config: ConfigData, model: Model, from: ModuleView, to: ModuleView, under: ModuleView): boolean => {
  const seen = new Set<ModuleView>([from]);
  for (const at of seen) {
    if (at === to) return true;
    for (const next of uses(config, model, at, under)) seen.add(next);
  }
  return false;
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
  return reaches(config, model, topOf(target, common), topOf(source, common), common);
};

const search = (state: Search, config: ConfigData, fixes: Fix[]): Fix[] | undefined => {
  const verdict = verdicts(config, state.model).verdict(state.from, state.to)!;
  if (verdict.allowed) return fixes;
  if (verdict.reason === 'private') {
    const change = exposeChange(state, config, verdict.hiddenBy);
    return change && search(state, change.config, [...fixes, change.fix]);
  }
  for (const candidates of [usingChanges, requireChanges])
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
  const view = model.isTest(from) ? 'test' : 'production';
  return lineage(model.moduleOf(to)!)
    .filter((module) => !above.includes(module))
    .find((module) => !judge.surface(module, undefined, view).has(to));
};

export const fixesFor = (config: ConfigData, model: Model, from: string, to: string): Fix[] | undefined =>
  search({ model, from, to }, config, []);
