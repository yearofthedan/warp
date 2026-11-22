import type { Model, UnitView } from '../../model/archetype/resolve.ts';
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

const id = 'unit-cycle';

interface FileLink {
  file: string;
  to: string;
  edges: ImportEdge[];
}

const chain = (unit: UnitView): UnitView[] => (unit.parent ? [...chain(unit.parent), unit] : [unit]);

const siblings = (model: Model, from: string, to: string): [UnitView, UnitView] | undefined => {
  const source = chain(model.unitOf(from)!);
  const target = chain(model.unitOf(to)!);
  const split = source.findIndex((unit, at) => unit !== target[at]);
  const [importer, imported] = [source[split], target[split]];
  return importer && imported ? [importer, imported] : undefined;
};

export const unitCycle: ProjectRule<CycleOptions> = {
  id,
  scope: 'project',
  defaults: cycleDefaults,
  parseOptions: cycleOptions,
  check: ({ model, project, atUnit }) => {
    const files = new Set(project.modules.map((module) => module.file));
    const units = new Map(model.units.map((unit) => [unit.id, unit]));
    const graph: Graph<FileLink> = new Map();
    for (const { file, imports } of project.modules) {
      for (const [to, edges] of importsByTarget(file, imports)) {
        const crossed = files.has(to) ? siblings(model, file, to) : undefined;
        if (crossed && counts(edges, atUnit(crossed[0]).options))
          link(graph, crossed[0].id, crossed[1].id, [{ file, to, edges }]);
      }
    }
    return loopEdges(graph).flatMap(({ from, to, links, loop }): Finding[] => {
      const unit = units.get(from)!;
      if (!atUnit(unit).on) return [];
      const [first] = links.toSorted((a, b) => a.file.localeCompare(b.file) || a.to.localeCompare(b.to));
      return [
        {
          rule: id,
          key: `${id}:${from}->${to}`,
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
        },
      ];
    });
  },
};
