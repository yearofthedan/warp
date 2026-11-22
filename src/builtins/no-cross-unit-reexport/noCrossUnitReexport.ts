import { place } from '../place.ts';
import type { Model, UnitView } from '../../model/archetype/resolve.ts';
import type { ImportEdge } from '../../model/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../rules/rule.ts';

const id = 'no-cross-unit-reexport';

export const noCrossUnitReexport: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ model, project, atFile }) =>
    project.modules.flatMap((module) => {
      const unit = model.unitOf(module.file);
      if (!unit || !atFile(module.file).on) return [];
      const reExports = module.imports.filter((edge) => edge.reExport);
      return [...Map.groupBy(reExports, (edge) => edge.via ?? edge.to)].flatMap(([to, edges]) => {
        const target = model.unitOf(to);
        if (!target || owns(unit, target)) return [];
        return [passedThrough(model, unit, target, to, edges)];
      });
    }),
};

const owns = (unit: UnitView, target: UnitView): boolean => {
  for (let at: UnitView | undefined = target; at; at = at.parent) if (at === unit) return true;
  return false;
};

const passedThrough = (model: Model, unit: UnitView, target: UnitView, to: string, edges: ImportEdge[]): Finding => {
  const from = edges[0]!.from;
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  const what = names.length > 0 ? names.join(', ') : 'everything';
  return {
    rule: id,
    key: `${id}:${from}->${to}`,
    file: from,
    line: edges[0]!.line,
    value: Math.max(1, names.length),
    message:
      `${from} (${place(model, from, unit)}) re-exports ${what} from ${to} (${place(model, to, target)}), so its ` +
      `importers reach ${target.id} through ${unit.id}. Have importers that need it use ${target.id} directly, give ` +
      `${unit.id} its own type that hides it, or move it into ${unit.id} if ${unit.id} owns it.`,
    details: {
      from: { unit: unit.id, part: model.partOf(from) },
      to: { unit: target.id, part: model.partOf(to) },
      names,
      edges,
    },
  };
};
