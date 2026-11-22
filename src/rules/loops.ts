import type { ImportEdge } from '../model/facts.ts';
import { ConfigError } from '../model/configError.ts';

export interface CycleOptions {
  types: 'count' | 'ignore';
}

export const cycleDefaults: CycleOptions = { types: 'count' };

export const cycleOptions = (raw: Record<string, unknown>, at: string): Partial<CycleOptions> => {
  const unknown = Object.keys(raw).filter((key) => key !== 'types');
  if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
  if (raw.types !== undefined && raw.types !== 'count' && raw.types !== 'ignore')
    throw new ConfigError(`${at}.types: expected 'count' or 'ignore'`);
  return raw as Partial<CycleOptions>;
};

export type Graph<T> = Map<string, Map<string, T[]>>;

export const link = <T>(graph: Graph<T>, from: string, to: string, values: readonly T[]) => {
  const targets = graph.get(from) ?? new Map<string, T[]>();
  graph.set(from, targets);
  targets.set(to, [...(targets.get(to) ?? []), ...values]);
  if (!graph.has(to)) graph.set(to, new Map());
};

interface Walk<T> {
  graph: Graph<T>;
  index: Map<string, number>;
  low: Map<string, number>;
  component: Map<string, number>;
  stack: string[];
}

const visit = <T>(walk: Walk<T>, node: string) => {
  const { graph, index, low, component, stack } = walk;
  index.set(node, index.size);
  low.set(node, index.get(node)!);
  stack.push(node);
  for (const next of graph.get(node)!.keys()) {
    if (!index.has(next)) visit(walk, next);
    if (!component.has(next)) low.set(node, Math.min(low.get(node)!, low.get(next)!));
  }
  if (low.get(node) !== index.get(node)) return;
  for (let member = stack.pop()!; ; member = stack.pop()!) {
    component.set(member, index.get(node)!);
    if (member === node) break;
  }
};

const components = <T>(graph: Graph<T>): Map<string, number> => {
  const walk: Walk<T> = { graph, index: new Map(), low: new Map(), component: new Map(), stack: [] };
  for (const node of graph.keys()) if (!walk.index.has(node)) visit(walk, node);
  return walk.component;
};

const pathBack = <T>(graph: Graph<T>, component: ReadonlyMap<string, number>, start: string, end: string): string[] => {
  const cameFrom = new Map<string, string>();
  const queue = [start];
  for (let at = 0; !cameFrom.has(end); at += 1) {
    const node = queue[at]!;
    for (const next of graph.get(node)!.keys()) {
      if (cameFrom.has(next) || component.get(next) !== component.get(start)) continue;
      cameFrom.set(next, node);
      queue.push(next);
    }
  }
  const path = [end];
  while (path[0] !== start) path.unshift(cameFrom.get(path[0]!)!);
  return path;
};

export const loopEdges = <T>(graph: Graph<T>): { from: string; to: string; links: T[]; loop: string[] }[] => {
  const component = components(graph);
  return [...graph].flatMap(([from, targets]) =>
    [...targets]
      .filter(([to]) => component.get(to) === component.get(from))
      .map(([to, links]) => ({ from, to, links, loop: [from, ...pathBack(graph, component, to, from)] })),
  );
};

export const importsByTarget = (file: string, imports: readonly ImportEdge[]) =>
  [...Map.groupBy(imports, (edge) => edge.via ?? edge.to)].filter(([to]) => to !== file);

export const counts = (edges: readonly ImportEdge[], options: CycleOptions): boolean =>
  options.types === 'count' || edges.some((edge) => !edge.typeOnly);
