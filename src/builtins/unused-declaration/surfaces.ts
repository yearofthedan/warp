import type { ExposesData } from '../../model/archetype/data.ts';
import type { ModuleView } from '../../model/archetype/resolve.ts';
import type { Finding } from '../../rules/rule.ts';
import { childrenNamed, type Context, instancesOf, type Layer, named, unused, within } from './declarations.ts';

interface Declared {
  declaredIn: string;
  layer: Layer;
  exposes: string;
  holders: ModuleView[];
  files: (holder: ModuleView) => ReadonlySet<string>;
}

interface Edge {
  from: string;
  to: string;
}

export const unusedSurfaces = (context: Context): Finding[] => {
  const edges = context.project.files.flatMap((file) =>
    file.imports.map((edge) => ({ from: file.path, to: edge.via ?? edge.to })),
  );
  return declared(context)
    .filter((declaration) => declaration.holders.some((holder) => context.atModule(holder).on))
    .filter(
      (declaration) =>
        !declaration.holders.some((holder) => reached(context, edges, holder, declaration.files(holder))),
    )
    .map(({ declaredIn, layer, exposes, holders }) => {
      const modules = holders.map((holder) => holder.id);
      const importers = layer === 'test' ? 'no test outside' : 'nothing outside';
      return unused(
        context.config,
        `${declaredIn}:${exposes}`,
        `${declaredIn} ${exposes}, but ${importers} ${holders.map(named).join(', ')} imports it. Remove it, or use the module where it is needed.`,
        { kind: 'surface', declaredIn, layer, exposes, modules },
      );
    });
};

const reached = (context: Context, edges: readonly Edge[], holder: ModuleView, files: ReadonlySet<string>): boolean =>
  edges.some(({ from, to }) => files.has(to) && !within(context.model.moduleOf(from), holder));

const declared = (context: Context): Declared[] =>
  Object.values(context.config.archetypes).flatMap((archetype) => {
    const instances = instancesOf(context, archetype.name).filter((instance) => instance !== context.model.root);
    const own = archetype.exposes ? production(context, archetype.name, archetype.exposes, instances) : [];
    const modules = archetype.modules.flatMap((module) => {
      const holders = childrenNamed(context, instances, module.name);
      return module.kind === 'files' && module.exposes
        ? production(context, `${archetype.name}.${module.name}`, module.exposes, holders)
        : [];
    });
    const tests = archetype.tests?.exposes ? test(`${archetype.name}.tests`, archetype.tests.exposes, instances) : [];
    return [...own, ...modules, ...tests];
  });

const production = (context: Context, declaredIn: string, exposes: ExposesData, holders: ModuleView[]): Declared[] => {
  const layer = 'production';
  if (exposes.kind !== 'surfaces')
    return [
      { declaredIn, layer, exposes: whole(exposes), holders, files: (holder) => context.verdicts.surface(holder) },
    ];
  return Object.keys(exposes.surfaces).map((name) => ({
    declaredIn,
    layer,
    exposes: `exposes ${name}`,
    holders,
    files: (holder) => context.verdicts.surface(holder, name),
  }));
};

const test = (declaredIn: string, exposes: ExposesData, holders: ModuleView[]): Declared[] => {
  const layer = 'test';
  const filesOf = (holder: ModuleView, names?: ReadonlySet<string>) =>
    new Set(
      holder.children
        .filter((child) => child.test && (names === undefined || names.has(child.name!)))
        .flatMap((child) => child.files),
    );
  if (exposes.kind !== 'surfaces')
    return [{ declaredIn, layer, exposes: whole(exposes), holders, files: (holder) => filesOf(holder) }];
  return Object.entries(exposes.surfaces).map(([name, refs]) => {
    const names = new Set(refs.flatMap((ref) => (ref.kind === 'module' ? [`tests.${ref.module}`] : [])));
    return { declaredIn, layer, exposes: `exposes ${name}`, holders, files: (holder) => filesOf(holder, names) };
  });
};

const whole = (exposes: Exclude<ExposesData, { kind: 'surfaces' }>): string => {
  if (exposes.kind === 'all') return 'exposes(all())';
  const selector = `files(${exposes.patterns.map((pattern) => `'${pattern}'`).join(', ')})`;
  return exposes.entry ? `.entry(${selector})` : `exposes(${selector})`;
};
