import { place } from '../place.ts';
import type { Model, ModuleView } from '../../domain/model/resolve.ts';
import type { ImportEdge, Project } from '../../domain/facts/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../domain/rules/rule.ts';

const id = 'no-cross-module-reexport';

export const noCrossModuleReexport: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ model, verdicts, project, atFile }) =>
    project.files.flatMap((file) => {
      const module = model.moduleOf(file.path);
      if (!module || !atFile(file.path).on) return [];
      const reExports = file.imports.filter((edge) => edge.reExport);
      return [...Map.groupBy(reExports, (edge) => edge.via ?? edge.to)].flatMap(([to, edges]) => {
        const target = model.moduleOf(to);
        if (!target || owns(module, target)) return [];
        const blocked = importersOf(project, file.path, to).filter(
          (importer) => !owns(target, model.moduleOf(importer)!) && !verdicts.verdict(importer, to)?.allowed,
        );
        return [passedThrough(model, module, target, to, edges, blocked)];
      });
    }),
};

const owns = (module: ModuleView, target: ModuleView): boolean => {
  for (let at: ModuleView | undefined = target; at; at = at.parent) if (at === module) return true;
  return false;
};

const importersOf = (project: Project, file: string, to: string): string[] =>
  project.files
    .filter((other) => other.imports.some((edge) => edge.via === file && edge.to === to && !edge.reExport))
    .map((other) => other.path);

const passedThrough = (
  model: Model,
  module: ModuleView,
  target: ModuleView,
  to: string,
  edges: ImportEdge[],
  blocked: string[],
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
      `importers reach ${target.id} through ${module.id}. ${direct(target, blocked)}give ${module.id} its own type that ` +
      `hides it, or move it into ${module.id} if ${module.id} owns it.`,
    details: {
      from: module.id,
      to: target.id,
      names,
      edges,
    },
  };
};

const direct = (target: ModuleView, blocked: string[]): string => {
  if (blocked.length === 0) return `Have importers that need it use ${target.id} directly, `;
  const count = blocked.length - 1;
  const others = count > 0 ? ` and ${count} other importer${count > 1 ? 's' : ''}` : '';
  return `${blocked[0]}${others} may not use ${target.id} directly, so `;
};
