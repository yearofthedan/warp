import type { ImportEdge } from '../../model/facts.ts';
import type { ProjectRule } from '../../rule/rule.ts';
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

const id = 'no-cycle';

export const noCycle: ProjectRule<CycleOptions> = {
  id,
  scope: 'project',
  defaults: cycleDefaults,
  parseOptions: cycleOptions,
  check: ({ project, atFile }) => {
    const files = new Set(project.modules.map((module) => module.file));
    const graph: Graph<ImportEdge> = new Map();
    for (const { file, imports } of project.modules) {
      const { options } = atFile(file);
      for (const [to, edges] of importsByTarget(file, imports))
        if (files.has(to) && counts(edges, options)) link(graph, file, to, edges);
    }
    return loopEdges(graph)
      .filter(({ from }) => atFile(from).on)
      .map(({ from, to, links: edges, loop }) => ({
        rule: id,
        key: `${id}:${from}->${to}`,
        file: from,
        line: edges[0]!.line,
        value: 1,
        message:
          `${from} imports ${to}, which leads back to it: ${loop.join(' -> ')}. ` +
          'Break the loop: move what both need into a file they both import, or invert one import.',
        details: { loop, edges },
      }));
  },
};
