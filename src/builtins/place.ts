import type { Model, ModuleView } from '../model/archetype/resolve.ts';

export const place = (model: Model, file: string, module: ModuleView = model.moduleOf(file)!): string => {
  if (module.kind === 'files') return `${module.name} of ${module.parent!.archetype} ${module.parent!.id}`;
  return `${module.looseFiles.includes(file) ? 'loose in ' : ''}${module.archetype} ${module.id}`;
};
