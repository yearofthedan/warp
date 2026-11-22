import type { ImportEdge, Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import { place } from './direction.ts';
import type { Verdicts } from './reach.ts';
import type { Model, UnitView } from './resolve.ts';

const id = 'no-double-export';

export const doubleExportFindings = (model: Model, verdicts: Verdicts, project: Project, docs?: string): Finding[] =>
  project.modules.flatMap((module) => {
    const unit = model.unitOf(module.file);
    if (!unit) return [];
    const surface = verdicts.surface(unit);
    if (!surface.has(module.file)) return [];
    const reExports = module.imports.filter((edge) => edge.reExport);
    return [...Map.groupBy(reExports, (edge) => edge.via ?? edge.to)].flatMap(([to, edges]) => {
      if (to === module.file || !surface.has(to)) return [];
      const finding = doubled(model, unit, to, edges);
      return [docs ? { ...finding, docs } : finding];
    });
  });

const doubled = (model: Model, unit: UnitView, to: string, edges: ImportEdge[]): Finding => {
  const from = edges[0]!.from;
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  return {
    rule: id,
    key: `${id}:${from}->${to}`,
    file: from,
    line: edges[0]!.line,
    value: Math.max(1, names.length),
    message:
      `${from} (${place(model, from, unit)}) re-exports ${to} (${place(model, to)}), and ${unit.id} exposes both, ` +
      `so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.`,
    details: { unit: unit.id, to: { unit: model.unitOf(to)!.id, part: model.partOf(to) }, edges },
  };
};
