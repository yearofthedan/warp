import type { Model, ModuleView } from '../domain/model/resolve.ts';

export const place = (model: Model, file: string, module: ModuleView = model.moduleOf(file)!): string => {
  if (module.kind !== 'dir') {
    const role = module.kind === 'test' ? 'test module ' : '';
    return `${role}${module.name} of ${module.parent!.archetype} ${module.parent!.id}`;
  }
  const role = module.looseFiles.includes(file) ? 'loose in ' : '';
  return `${role}${module.archetype} ${module.id}`;
};
