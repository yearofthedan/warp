import type { Model, ModuleView } from '../../model/archetype/resolve.ts';
import type { ImportEdge } from '../../model/facts.ts';
import type { Finding, ProjectRule } from '../../rules/rule.ts';
import {
  counts,
  cycleDefaults,
  cycleOptions,
  type CycleOptions,
  type Graph,
  importsByTarget,
  link,
  listed,
  type Loop,
  loops,
  named,
  uniqueSites,
} from '../loops.ts';

const id = 'module-cycle';

interface FileLink {
  file: string;
  to: string;
  edges: ImportEdge[];
}

const chain = (module: ModuleView): ModuleView[] => (module.parent ? [...chain(module.parent), module] : [module]);

const siblings = (model: Model, from: string, to: string): [ModuleView, ModuleView] | undefined => {
  const source = chain(model.moduleOf(from)!);
  const target = chain(model.moduleOf(to)!);
  const split = source.findIndex((module, at) => module !== target[at]);
  const [importer, imported] = [source[split], target[split]];
  return importer && imported ? [importer, imported] : undefined;
};

export const moduleCycle: ProjectRule<CycleOptions> = {
  id,
  scope: 'project',
  defaults: cycleDefaults,
  parseOptions: cycleOptions,
  check: ({ model, project, atModule }) => {
    const files = new Set(project.files.map((file) => file.path));
    const modules = new Map(model.modules.map((module) => [module.id, module]));
    const graph: Graph<FileLink> = new Map();
    for (const { path: file, imports } of project.files) {
      if (model.isTest(file)) continue;
      for (const [to, edges] of importsByTarget(file, imports)) {
        const crossed = files.has(to) ? siblings(model, file, to) : undefined;
        if (crossed && counts(edges, atModule(crossed[0]).options))
          link(graph, crossed[0].id, crossed[1].id, [{ file, to, edges }]);
      }
    }
    return loops(graph).flatMap((loop): Finding[] => {
      const reported = loop.edges.filter(({ from }) => atModule(modules.get(from)!).on);
      if (reported.length === 0) return [];
      return [loopFinding(loop.members, reported, modules.get(loop.members[0]!)!.parent!.id)];
    });
  },
};

const loopFinding = (members: string[], reported: Loop<FileLink>['edges'], parent: string): Finding => {
  const links = reported.flatMap(({ links }) => links);
  const sites = uniqueSites(links.map(({ file, edges: [first] }) => ({ file, line: first!.line }))).toSorted(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
  const crossings = reported.map(({ from, to, links: [first, ...rest] }) => {
    const more = rest.length === 0 ? '' : `, and ${rest.length} other import${rest.length === 1 ? '' : 's'}`;
    return `${from} -> ${to} (${first!.file}:${first!.edges[0]!.line} imports ${first!.to}${more})`;
  });
  return {
    rule: id,
    key: `${id}:${members.join('+')}`,
    file: sites[0]!.file,
    line: sites[0]!.line,
    value: links.length,
    message:
      `${named(members)} import each other in a loop: ${listed(crossings)}. ` +
      'Break it at one of these imports: move what both sides need into a module they both use, or turn ' +
      'module-cycle off on the module that holds them if they are meant to use each other.',
    sites,
    parts: reported.map(({ from, to }) => `${from}->${to}`),
    details: {
      module: parent,
      modules: members,
      imports: links.map(({ file, to, edges }) => ({ from: file, to, edges })),
    },
  };
};
