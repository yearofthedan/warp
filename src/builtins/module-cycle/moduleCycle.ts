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
  loopEdges,
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
    return loopEdges(graph).flatMap(({ from, to, links, loop }): Finding[] => {
      const module = modules.get(from)!;
      if (!atModule(module).on) return [];
      const [first] = links.toSorted((a, b) => a.file.localeCompare(b.file) || a.to.localeCompare(b.to));
      return [
        {
          rule: id,
          key: `${id}:${from}->${to}`,
          file: first!.file,
          line: first!.edges[0]!.line,
          value: links.length,
          message:
            `${from} imports ${to} (${first!.file} imports ${first!.to}), and the modules of ${module.parent!.id} loop: ` +
            `${loop.join(' -> ')}. Break the loop: move what both need into a module they both use, or turn module-cycle ` +
            'off on the module that holds them if they are meant to use each other.',
          details: {
            module: module.parent!.id,
            loop,
            imports: links.map(({ file, to, edges }) => ({ from: file, to, edges })),
          },
        },
      ];
    });
  },
};
