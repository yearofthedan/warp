/**
 * `unit-cycle` and `no-cycle`: one finding per edge in a loop, between sibling units or between files
 * (docs/design/archetypes.md, Cycles). Type-only edges join a loop only where `types` is `count`.
 */
import type { ImportEdge, Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import type { Model, UnitView } from './resolve.ts';
import type { Settings } from './settings.ts';

/** A directed graph by node id: each node's targets, with what links them. */
type Graph<T> = Map<string, Map<string, T[]>>;

const link = <T>(graph: Graph<T>, from: string, to: string, values: readonly T[]) => {
  const targets = graph.get(from) ?? new Map<string, T[]>();
  graph.set(from, targets);
  targets.set(to, [...(targets.get(to) ?? []), ...values]);
  // Every node has an entry, so a walk reads any node's targets.
  if (!graph.has(to)) graph.set(to, new Map());
};

/** Tarjan's walk: each node's visit order, the lowest it reaches back to, and the nodes not yet in a component. */
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
  // The node is the first visited of its component, whose members are the stack down to it.
  for (let member = stack.pop()!; ; member = stack.pop()!) {
    component.set(member, index.get(node)!);
    if (member === node) break;
  }
};

/** Each node's strongly connected component, by Tarjan's algorithm: two nodes share one when each reaches the other. */
const components = <T>(graph: Graph<T>): Map<string, number> => {
  const walk: Walk<T> = { graph, index: new Map(), low: new Map(), component: new Map(), stack: [] };
  for (const node of graph.keys()) if (!walk.index.has(node)) visit(walk, node);
  return walk.component;
};

/** The shortest way from `start` back to `end` inside one component, both ends included. */
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

/** Each edge of the graph that lies on a loop, with the shortest loop through it. */
const loopEdges = <T>(graph: Graph<T>): { from: string; to: string; links: T[]; loop: string[] }[] => {
  const component = components(graph);
  return [...graph].flatMap(([from, targets]) =>
    [...targets]
      .filter(([to]) => component.get(to) === component.get(from))
      .map(([to, links]) => ({ from, to, links, loop: [from, ...pathBack(graph, component, to, from)] })),
  );
};

/** A file's imports by the file each specifier names, its own imports left out. */
const importsByTarget = (file: string, imports: readonly ImportEdge[]) =>
  [...Map.groupBy(imports, (edge) => edge.via ?? edge.to)].filter(([to]) => to !== file);

const counts = (edges: readonly ImportEdge[], options: Record<string, unknown>): boolean =>
  options.types === 'count' || edges.some((edge) => !edge.typeOnly);

/** The imports from one file to another that link two units. */
interface FileLink {
  file: string;
  to: string;
  edges: ImportEdge[];
}

/** Every loop between files; the caller drops the findings on files where no-cycle is off. */
export const fileCycleFindings = (project: Project, settings: Settings, docs?: string): Finding[] => {
  const files = new Set(project.modules.map((module) => module.file));
  const graph: Graph<ImportEdge> = new Map();
  for (const { file, imports } of project.modules) {
    const { options } = settings.atFile(file, 'no-cycle');
    for (const [to, edges] of importsByTarget(file, imports))
      if (files.has(to) && counts(edges, options)) link(graph, file, to, edges);
  }
  return loopEdges(graph).map(({ from, to, links: edges, loop }) => ({
    rule: 'no-cycle',
    key: `no-cycle:${from}->${to}`,
    file: from,
    line: edges[0]!.line,
    value: 1,
    message:
      `${from} imports ${to}, which leads back to it: ${loop.join(' -> ')}. ` +
      'Break the loop: move what both need into a file they both import, or invert one import.',
    details: { loop, edges },
    ...(docs ? { docs } : {}),
  }));
};

/** The units from the root down to the file's own. */
const chain = (unit: UnitView): UnitView[] => (unit.parent ? [...chain(unit.parent), unit] : [unit]);

/** The two sibling units an import crosses between, below the deepest unit holding both files. */
const siblings = (model: Model, from: string, to: string): [UnitView, UnitView] | undefined => {
  const source = chain(model.unitOf(from)!);
  const target = chain(model.unitOf(to)!);
  const split = source.findIndex((unit, at) => unit !== target[at]);
  const [importer, imported] = [source[split], target[split]];
  return importer && imported ? [importer, imported] : undefined;
};

export const unitCycleFindings = (model: Model, project: Project, settings: Settings, docs?: string): Finding[] => {
  const files = new Set(project.modules.map((module) => module.file));
  const units = new Map(model.units.map((unit) => [unit.id, unit]));
  const graph: Graph<FileLink> = new Map();
  for (const { file, imports } of project.modules) {
    for (const [to, edges] of importsByTarget(file, imports)) {
      const crossed = files.has(to) ? siblings(model, file, to) : undefined;
      if (crossed && counts(edges, settings.atUnit(crossed[0], 'unit-cycle').options))
        link(graph, crossed[0].id, crossed[1].id, [{ file, to, edges }]);
    }
  }
  return loopEdges(graph).flatMap(({ from, to, links, loop }): Finding[] => {
    const unit = units.get(from)!;
    if (!settings.atUnit(unit, 'unit-cycle').on) return [];
    const [first] = links.toSorted((a, b) => a.file.localeCompare(b.file) || a.to.localeCompare(b.to));
    return [
      {
        rule: 'unit-cycle',
        key: `unit-cycle:${from}->${to}`,
        file: first!.file,
        line: first!.edges[0]!.line,
        value: links.length,
        message:
          `${from} imports ${to} (${first!.file} imports ${first!.to}), and the units of ${unit.parent!.id} loop: ` +
          `${loop.join(' -> ')}. Break the loop: move what both need into a unit they both use, or turn unit-cycle ` +
          'off on the dir part if its units are meant to use each other.',
        details: {
          unit: unit.parent!.id,
          loop,
          imports: links.map(({ file, to, edges }) => ({ from: file, to, edges })),
        },
        ...(docs ? { docs } : {}),
      },
    ];
  });
};
