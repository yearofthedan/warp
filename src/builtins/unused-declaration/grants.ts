import {
  type ArchetypeData,
  type ConfigData,
  isTestData,
  type ModuleData,
  type RefData,
} from '../../model/archetype/data.ts';
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
  ending: string;
  kit?: true;
}

export const unusedGrants = (context: Context): Finding[] => {
  const used = usedRefs(context);
  return declared(context, used)
    .filter(({ ref, holders }) => !used.has(ref) && holders.some((holder) => context.atModule(holder).on))
    .map(({ ref, declaredIn, layer, holders, ending, kit }) => {
      const using = show(ref);
      const modules = holders.map((holder) => holder.id);
      const names = holders.map(named).join(', ');
      const files = kit ? `the tests of ${names}` : names;
      return unused(
        context.config,
        `${declaredIn}->${using}`,
        `${declaredIn} names ${using}, but nothing in ${files} imports through it. ${ending}`,
        { kind: 'grant', declaredIn, layer, using, modules },
      );
    });
};

const declared = (context: Context, used: ReadonlySet<RefData>): Declared[] =>
  Object.values(context.config.archetypes).flatMap((archetype) => {
    const instances = instancesOf(context, archetype.name);
    const unusedInputs = new Set(
      archetype.requires.filter((name) => !bindingsOf(context.config, archetype, name).some((ref) => used.has(ref))),
    );
    const requires = [...unusedInputs].map((name) => ({
      ref: { kind: 'required' as const, name },
      declaredIn: `${archetype.name}.requires`,
      layer: 'production' as const,
      holders: instances,
      ending: 'Remove it, with its binding at each use.',
    }));
    const modules = archetype.modules.flatMap((module) => {
      const holders = childrenNamed(context, instances, module.name);
      const layer: Layer = isTestData(module) ? 'test' : 'production';
      return module.using
        .filter((ref) => !fills(context.config, module, ref))
        .filter((ref) => ref.kind !== 'required' || !unusedInputs.has(ref.name))
        .map((ref) => ({
          ref,
          declaredIn: `${archetype.name}.${module.name}.dependencies`,
          layer,
          holders,
          ending: 'Remove it.',
        }));
    });
    const kit = (archetype.testUsing ?? []).map((ref) => ({
      ref,
      declaredIn: `${archetype.name}.test.provides`,
      layer: 'test' as const,
      holders: instances,
      ending: 'Remove it.',
      kit: true as const,
    }));
    return [...requires, ...modules, ...kit];
  });

const fills = (config: ConfigData, module: ModuleData, ref: RefData): boolean =>
  module.kind === 'dir' &&
  Object.entries(module.inputs ?? {}).some(
    ([name, bound]) => bound === ref && config.archetypes[module.archetype]!.requires.includes(name),
  );

const bindingsOf = (config: ConfigData, archetype: ArchetypeData, name: string): RefData[] =>
  Object.values(config.archetypes).flatMap((holder) =>
    holder.modules.flatMap((module) =>
      module.kind === 'dir' && module.archetype === archetype.name && module.inputs?.[name]
        ? [module.inputs[name]]
        : [],
    ),
  );

const usedRefs = ({ project, verdicts }: Context): Set<RefData> => {
  const used = new Set<RefData>();
  for (const file of project.files) {
    const reach = verdicts.reach(file.path) ?? [];
    const targets = file.imports.map((edge) => edge.via ?? edge.to);
    for (const grant of reach) {
      if (!grant.declared || !permits(grant, targets, file.externals)) continue;
      used.add(grant.declared);
      for (const bound of grant.via ?? []) used.add(bound);
    }
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
