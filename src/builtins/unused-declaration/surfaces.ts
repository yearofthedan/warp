import { type ExposesData, isTestData } from '../../model/archetype/data.ts';
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
    const judged = isEntry(archetype.exposes)
      ? instances.filter((instance) => !isTopLevel(context, instance))
      : instances;
    const own = archetype.exposes
      ? surfaces(context, archetype.name, archetype.exposes, judged, archetype.test ? 'test' : 'production')
      : [];
    const tests = Object.entries(archetype.testExposes ?? {}).map(([name, refs]) => ({
      declaredIn: archetype.name,
      layer: 'test' as const,
      exposes: `test.exposes ${name}`,
      holders: instances,
      files: (holder: ModuleView) => new Set(refs.flatMap((ref) => [...context.verdicts.files(holder, ref, 'test')])),
    }));
    const modules = archetype.modules.flatMap((module) => {
      const holders = childrenNamed(context, instances, module.name);
      const layer: Layer = isTestData(module) ? 'test' : 'production';
      return module.kind !== 'dir' && module.exposes
        ? surfaces(context, `${archetype.name}.${module.name}`, module.exposes, holders, layer)
        : [];
    });
    return [...own, ...tests, ...modules];
  });

const isEntry = (exposes: ExposesData | undefined): boolean => exposes?.kind === 'files' && exposes.entry === true;

const isTopLevel = (context: Context, module: ModuleView): boolean => module.parent === context.model.root;

const surfaces = (
  context: Context,
  declaredIn: string,
  exposes: ExposesData,
  holders: ModuleView[],
  layer: Layer,
): Declared[] => {
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

const whole = (exposes: Exclude<ExposesData, { kind: 'surfaces' }>): string => {
  if (exposes.kind === 'all') return 'exposes: all';
  const patterns = exposes.patterns.join(', ');
  return exposes.entry ? `entry: ${patterns}` : `exposes: { files: [${patterns}] }`;
};
