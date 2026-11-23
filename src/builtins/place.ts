import type { Model, ModuleView } from '../model/archetype/resolve.ts';

export const place = (model: Model, file: string, module: ModuleView = model.moduleOf(file)!): string => {
  if (module.kind === 'files') return `${module.name} of ${module.parent!.archetype} ${module.parent!.id}`;
  const role = module.looseFiles.includes(file) ? 'loose in ' : model.isTest(file) ? 'a test of ' : '';
  return `${role}${module.archetype} ${module.id}`;
};
