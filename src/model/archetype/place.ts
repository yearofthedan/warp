import type { Model, UnitView } from './resolve.ts';

export const place = (model: Model, file: string, unit: UnitView = model.unitOf(file)!): string => {
  if (unit.archetype === undefined) return `plain folder ${unit.id}`;
  const part = model.partOf(file);
  return `${part === undefined ? 'loose in' : `${part} of`} ${unit.archetype} ${unit.id}`;
};
