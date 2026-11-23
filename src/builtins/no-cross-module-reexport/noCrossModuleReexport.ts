import { place } from '../place.ts';
import type { Model, ModuleView } from '../../model/archetype/resolve.ts';
import type { ImportEdge } from '../../model/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../rules/rule.ts';

const id = 'no-cross-module-reexport';

export const noCrossModuleReexport: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ model, project, atFile }) =>
    project.files.flatMap((file) => {
      const module = model.moduleOf(file.path);
      if (!module || !atFile(file.path).on) return [];
      const reExports = file.imports.filter((edge) => edge.reExport);
      return [...Map.groupBy(reExports, (edge) => edge.via ?? edge.to)].flatMap(([to, edges]) => {
        const target = model.moduleOf(to);
        if (!target || owns(module, target)) return [];
        return [passedThrough(model, module, target, to, edges)];
      });
    }),
};

const owns = (module: ModuleView, target: ModuleView): boolean => {
  for (let at: ModuleView | undefined = target; at; at = at.parent) if (at === module) return true;
  return false;
};

const passedThrough = (
  model: Model,
  module: ModuleView,
  target: ModuleView,
  to: string,
  edges: ImportEdge[],
): Finding => {
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
      `${from} (${place(model, from, module)}) re-exports ${what} from ${to} (${place(model, to, target)}), so its ` +
      `importers reach ${target.id} through ${module.id}. Have importers that need it use ${target.id} directly, give ` +
      `${module.id} its own type that hides it, or move it into ${module.id} if ${module.id} owns it.`,
    details: {
      from: { module: module.id, part: model.partOf(from) },
      to: { module: target.id, part: model.partOf(to) },
      names,
      edges,
    },
  };
};
