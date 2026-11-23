import type { Model, ModuleView } from '../model/archetype/resolve.ts';

export const place = (model: Model, file: string, module: ModuleView = model.moduleOf(file)!): string => {
  if (module.archetype === undefined) return `plain folder ${module.id}`;
  const part = model.partOf(file);
  return `${part === undefined ? 'loose in' : `${part} of`} ${module.archetype} ${module.id}`;
};
