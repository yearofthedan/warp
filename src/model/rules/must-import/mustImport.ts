import type { FilesPartData } from '../../archetype/data.ts';
import { place } from '../../archetype/place.ts';
import { show } from '../../archetype/references.ts';
import type { UnitView } from '../../archetype/resolve.ts';
import type { ModuleFacts } from '../../facts.ts';
import { type Finding, noOptions, type ProjectContext, type ProjectRule } from '../../rule.ts';

const id = 'must-import';

export const mustImport: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: (context) => {
    const modules = new Map(context.project.modules.map((module) => [module.file, module]));
    return context.model.units.flatMap((unit) =>
      (unit.archetype === undefined ? [] : context.config.archetypes[unit.archetype]!.parts).flatMap((part) =>
        part.kind === 'files' && part.mustImport ? partFindings(context, modules, unit, part) : [],
      ),
    );
  },
};

const partFindings = (
  { model, verdicts, atFile }: ProjectContext<object>,
  modules: ReadonlyMap<string, ModuleFacts>,
  unit: UnitView,
  part: FilesPartData,
): Finding[] =>
  part.mustImport!.flatMap((ref) => {
    const targets = verdicts.files(unit, ref);
    const to = verdicts.describe(unit, ref);
    return (unit.parts[part.name] ?? []).flatMap((file): Finding[] => {
      const module = modules.get(file);
      if (!module || !atFile(file).on) return [];
      if (module.imports.some((edge) => targets.has(edge.to) || (edge.via !== undefined && targets.has(edge.via))))
        return [];
      return [
        {
          rule: id,
          key: `${id}:${file}->${show(ref)}`,
          file,
          line: 1,
          value: 1,
          message:
            `${file} (${place(model, file)}) imports nothing from ${to}, which every file in ${part.name} must ` +
            `import. Import what it needs from ${to}, or move the file out of ${part.name}.`,
          details: { unit: unit.id, part: part.name, to },
        },
      ];
    });
  });
