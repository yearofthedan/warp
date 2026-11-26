import { place } from '../place.ts';
import type { Verdicts } from '../../domain/model/reach.ts';
import type { Model, ModuleView } from '../../domain/model/resolve.ts';
import type { ImportEdge } from '../../domain/facts/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../domain/rules/rule.ts';

const id = 'no-double-export';

const exposingBoth = (verdicts: Verdicts, module: ModuleView, from: string, to: string): ModuleView | undefined => {
  for (let at: ModuleView | undefined = module; at; at = at.parent)
    if (verdicts.surface(at).has(from) && verdicts.surface(at).has(to)) return at;
  return undefined;
};

export const noDoubleExport: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ model, verdicts, project, atFile }) =>
    project.files.flatMap((file) => {
      const module = model.moduleOf(file.path);
      if (!module || !atFile(file.path).on) return [];
      const reExports = file.imports.filter((edge) => edge.reExport);
      return [...Map.groupBy(reExports, (edge) => edge.via ?? edge.to)].flatMap(([to, edges]) => {
        const surface = to === file.path ? undefined : exposingBoth(verdicts, module, file.path, to);
        return surface ? [doubled(model, surface, to, edges)] : [];
      });
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
      `${from} (${place(model, from)}) re-exports ${to} (${place(model, to)}), and ${module.id} exposes both, ` +
      `so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.`,
    details: { module: module.id, to: model.moduleOf(to)!.id, edges },
  };
};
