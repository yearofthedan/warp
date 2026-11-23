import type { RefData } from '../../model/archetype/data.ts';
import type { Grant } from '../../model/archetype/reach.ts';
import { show } from '../../model/archetype/references.ts';
import type { ModuleView } from '../../model/archetype/resolve.ts';
import type { Finding } from '../../rules/rule.ts';
import { listsPackage } from '../packages.ts';
import { childrenNamed, type Context, instancesOf, type Layer, named, unused } from './declarations.ts';

interface Declared {
  ref: RefData;
  declaredIn: string;
  layer: Layer;
  holders: ModuleView[];
}

export const unusedGrants = (context: Context): Finding[] => {
  const used = usedRefs(context);
  return declared(context)
    .filter(({ ref, holders }) => !used.has(ref) && holders.some((holder) => context.atModule(holder).on))
    .map(({ ref, declaredIn, layer, holders }) => {
      const using = show(ref);
      const modules = holders.map((holder) => holder.id);
      const names = holders.map(named).join(', ');
      const files = layer === 'test' ? `tests of ${names}` : names;
      return unused(
        context.config,
        `${declaredIn}->${using}`,
        `${declaredIn} uses ${using}, but nothing in ${files} imports through it. Remove it from the using.`,
        { kind: 'grant', declaredIn, layer, using, modules },
      );
    });
};

const declared = (context: Context): Declared[] =>
  Object.values(context.config.archetypes).flatMap((archetype) => {
    const instances = instancesOf(context, archetype.name);
    const modules = archetype.modules.flatMap((module) => {
      const holders = childrenNamed(context, instances, module.name);
      const declaredIn = `${archetype.name}.${module.name}`;
      const tests = module.kind === 'files' ? (module.tests?.using ?? []) : [];
      return [
        ...module.using.map((ref) => ({ ref, declaredIn, layer: 'production' as const, holders })),
        ...tests.map((ref) => ({ ref, declaredIn: `${declaredIn}.tests`, layer: 'test' as const, holders })),
      ];
    });
    const layer = (archetype.tests?.using ?? []).map((ref) => ({
      ref,
      declaredIn: `${archetype.name}.tests`,
      layer: 'test' as const,
      holders: instances,
    }));
    return [...modules, ...layer];
  });

const usedRefs = ({ project, verdicts }: Context): Set<RefData> => {
  const used = new Set<RefData>();
  for (const file of project.files) {
    const reach = verdicts.reach(file.path) ?? [];
    const targets = file.imports.map((edge) => edge.via ?? edge.to);
    for (const grant of reach) if (grant.declared && permits(grant, targets, file.externals)) used.add(grant.declared);
  }
  return used;
};

const permits = (
  grant: Grant,
  targets: readonly string[],
  externals: Context['project']['files'][number]['externals'],
) =>
  grant.package === undefined
    ? targets.some((to) => grant.files.has(to))
    : externals.some((external) => listsPackage(grant.package!, external));
