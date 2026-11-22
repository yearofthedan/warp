import type { ImportEdge, Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import type { ConfigData } from './data.ts';
import { place } from './direction.ts';
import type { Verdicts } from './reach.ts';
import type { Model, UnitView } from './resolve.ts';

const id = 'no-private-reexport';

const within = (unit: UnitView, inner: UnitView | undefined): boolean => {
  for (let at = inner; at; at = at.parent) if (at === unit) return true;
  return false;
};

export const reexportFindings = (
  config: ConfigData,
  model: Model,
  verdicts: Verdicts,
  project: Project,
  docs?: string,
): Finding[] =>
  project.modules.flatMap((module) => {
    const unit = model.unitOf(module.file);
    if (!unit) return [];
    const surface = verdicts.surface(unit);
    if (!surface.has(module.file)) return [];
    const reExports = module.imports.filter((edge) => edge.reExport);
    return [...Map.groupBy(reExports, (edge) => edge.via ?? edge.to)].flatMap(([to, edges]) => {
      if (surface.has(to) || !within(unit, model.unitOf(to))) return [];
      const finding = widened(config, model, unit, to, edges);
      return [docs ? { ...finding, docs } : finding];
    });
  });

const widened = (config: ConfigData, model: Model, unit: UnitView, to: string, edges: ImportEdge[]): Finding => {
  const from = edges[0]!.from;
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  const archetype = unit.archetype!;
  const declared = config.archetypes[archetype]!.exposes;
  const exposes = declared ? Object.keys(declared).join(', ') : 'its own files and what its units expose';
  return {
    rule: id,
    key: `${id}:${from}->${to}`,
    file: from,
    line: edges[0]!.line,
    value: Math.max(1, names.length),
    message:
      `${from} (${place(model, from, unit)}) is on ${unit.id}'s surface and re-exports ${to} (${place(model, to)}), ` +
      `which ${unit.id} keeps private (it exposes ${exposes}). ` +
      `Expose what holds ${to} from ${archetype} if other units should reach it, or stop re-exporting it.`,
    details: { unit: unit.id, to: { unit: model.unitOf(to)!.id, part: model.partOf(to) }, edges },
  };
};
