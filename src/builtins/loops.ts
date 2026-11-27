import type { ImportEdge } from '../domain/facts/facts.ts';
import { ConfigError } from '../domain/errors/configError.ts';

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

export interface Loop<T> {
  members: string[];
  edges: { from: string; to: string; links: T[] }[];
}

export const loops = <T>(graph: Graph<T>): Loop<T>[] => {
  const component = components(graph);
  const found = new Map<number, Loop<T>['edges']>();
  for (const [from, targets] of graph)
    for (const [to, links] of targets) {
      const at = component.get(from)!;
      if (component.get(to) === at) found.set(at, [...(found.get(at) ?? []), { from, to, links }]);
    }
  return [...found.values()].map((edges) => ({
    members: [...new Set(edges.map(({ from }) => from))].sort(),
    edges: edges.toSorted((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  }));
};

export const named = (items: readonly string[]): string => `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export const uniqueSites = <S extends { file: string; line: number }>(sites: readonly S[]): S[] => [
  ...new Map(sites.map((site) => [`${site.file}:${site.line}`, site])).values(),
];

export const listed = (items: readonly string[], most = 5): string =>
  items.length <= most ? items.join(', ') : `${items.slice(0, most).join(', ')}, and ${items.length - most} more`;

export const importsByTarget = (file: string, imports: readonly ImportEdge[]) =>
  [...Map.groupBy(imports, (edge) => edge.via ?? edge.to)].filter(([to]) => to !== file);

export const counts = (edges: readonly ImportEdge[], options: CycleOptions): boolean =>
  options.types === 'count' || edges.some((edge) => !edge.typeOnly);
