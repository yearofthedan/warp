import { place } from '../place.ts';
import type { Model, ModuleView } from '../../model/archetype/resolve.ts';
import type { ImportEdge } from '../../model/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../rules/rule.ts';

const id = 'no-double-export';

export const noDoubleExport: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ model, verdicts, project, atFile }) =>
    project.files.flatMap((file) => {
      const module = model.moduleOf(file.path);
      if (!module || !atFile(file.path).on) return [];
      const surface = verdicts.surface(module);
      if (!surface.has(file.path)) return [];
      const reExports = file.imports.filter((edge) => edge.reExport);
      return [...Map.groupBy(reExports, (edge) => edge.via ?? edge.to)].flatMap(([to, edges]) =>
        to === file.path || !surface.has(to) ? [] : [doubled(model, module, to, edges)],
      );
    }),
};

const doubled = (model: Model, module: ModuleView, to: string, edges: ImportEdge[]): Finding => {
  const from = edges[0]!.from;
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  return {
    rule: id,
    key: `${id}:${from}->${to}`,
    file: from,
    line: edges[0]!.line,
    value: Math.max(1, names.length),
    message:
      `${from} (${place(model, from, module)}) re-exports ${to} (${place(model, to)}), and ${module.id} exposes both, ` +
      `so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.`,
    details: { module: module.id, to: { module: model.moduleOf(to)!.id, part: model.partOf(to) }, edges },
  };
};
