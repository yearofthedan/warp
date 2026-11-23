import type { ModuleData } from '../../model/archetype/data.ts';
import type { ModuleView } from '../../model/archetype/resolve.ts';
import type { Finding } from '../../rules/rule.ts';
import { childrenNamed, type Context, instancesOf, type Layer, named, unused } from './declarations.ts';

export const emptyModules = (context: Context): Finding[] =>
  Object.values(context.config.archetypes).flatMap((archetype) => {
    const instances = instancesOf(context, archetype.name);
    const on = instances.some((instance) => context.atModule(instance).on);
    const declared = [
      ...archetype.modules.map((module) => ({ module, name: module.name, layer: 'production' as const })),
      ...(archetype.tests?.modules ?? []).map((module) => ({
        module,
        name: `tests.${module.name}`,
        layer: 'test' as const,
      })),
    ];
    return declared
      .filter(({ name }) => on && childrenNamed(context, instances, name).length === 0)
      .map(({ module, name, layer }) => empty(context, `${archetype.name}.${name}`, module, layer, instances));
  });

const empty = (context: Context, declaredIn: string, module: ModuleData, layer: Layer, instances: ModuleView[]) => {
  const selector = module.kind === 'dir' ? `dir(${quoted(module.paths)})` : `files(${quoted(module.patterns)})`;
  const where = instances.map(named).join(', ');
  return unused(
    context.config,
    declaredIn,
    `${declaredIn} matches no files: ${selector} finds nothing in ${where}. Fix the selector, or remove the module.`,
    { kind: 'empty', declaredIn, layer, selector },
  );
};

const quoted = (patterns: readonly string[]): string => patterns.map((pattern) => `'${pattern}'`).join(', ');
