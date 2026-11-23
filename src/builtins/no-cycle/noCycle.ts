import type { ImportEdge } from '../../model/facts.ts';
import type { ProjectRule } from '../../rules/rule.ts';
import {
  counts,
  cycleDefaults,
  cycleOptions,
  type CycleOptions,
  type Graph,
  importsByTarget,
  link,
  listed,
  loops,
  named,
  uniqueSites,
} from '../loops.ts';

const id = 'no-cycle';

export const noCycle: ProjectRule<CycleOptions> = {
  id,
  scope: 'project',
  defaults: cycleDefaults,
  parseOptions: cycleOptions,
  check: ({ project, atFile }) => {
    const files = new Set(project.files.map((file) => file.path));
    const graph: Graph<ImportEdge> = new Map();
    for (const { path: file, imports } of project.files) {
      const { options } = atFile(file);
      for (const [to, edges] of importsByTarget(file, imports))
        if (files.has(to) && counts(edges, options)) link(graph, file, to, edges);
    }
    return loops(graph).flatMap(({ members, edges }) => {
      const reported = edges.filter(({ from }) => atFile(from).on);
      if (reported.length === 0) return [];
      const sites = reported.map(({ from, links: [first] }) => ({ file: from, line: first!.line }));
      const who = members.length <= 3 ? named(members) : `${members.length} files`;
      return [
        {
          rule: id,
          key: `${id}:${members.join('+')}`,
          file: sites[0]!.file,
          line: sites[0]!.line,
          value: reported.length,
          message:
            `${who} import each other in a loop: ${listed(sites.map(({ file, line }, at) => `${file}:${line} imports ${reported[at]!.to}`))}. ` +
            'Break it at one of these imports: move what both need into a file they both import, or invert one import.',
          sites: uniqueSites(sites),
          parts: reported.map(({ from, to }) => `${from}->${to}`),
          details: { files: members, edges: reported.flatMap(({ links }) => links) },
        },
      ];
    });
  },
};
