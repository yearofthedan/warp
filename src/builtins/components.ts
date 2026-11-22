import type { Unit, UnitGraph, UnitKind } from '../model/facts.ts';

export const components = (graph: UnitGraph, counted: readonly UnitKind[]): Unit[][] => {
  const parent = graph.units.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (const [a, b] of graph.links) parent[root(a)] = root(b);

  const groups = new Map<number, Unit[]>();
  graph.units.forEach((unit, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  });
  return [...groups.values()]
    .filter((group) => group.some((unit) => counted.includes(unit.kind)))
    .sort((a, b) => a[0].line - b[0].line);
};
