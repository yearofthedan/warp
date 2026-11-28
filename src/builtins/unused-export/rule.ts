import { within } from '../boundaries.ts';
import type { ConfigData, ExposesData } from '../../domain/model/data.ts';
import type { Export, FileFacts, ImportEdge } from '../../domain/facts/facts.ts';
import { declarationOf, type Model, type ModuleView } from '../../domain/model/resolve.ts';
import { type Finding, noOptions, type ProjectRule } from '../../domain/rules/rule.ts';

const id = 'unused-export';

interface Use {
  from: string;
  edge: ImportEdge;
}

export const unusedExport: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ config, model, verdicts, project, atModule }) => {
    const uses = productionUses(model, project.files);
    const byPath = new Map(project.files.map((file) => [file.path, file]));
    return model.modules
      .filter((module) => judged(config, model, module) && atModule(module).on)
      .flatMap((module) =>
        [...verdicts.surface(module)]
          .filter((path) => model.moduleOf(path) === module)
          .flatMap((path) =>
            (byPath.get(path)?.exports ?? [])
              .filter((name) => !used(model, module, path, name, uses))
              .map((name) => finding(module, path, name)),
          ),
      );
  },
};

const productionUses = (model: Model, files: readonly FileFacts[]): Use[] =>
  files.flatMap(({ path, imports }) => (model.isTest(path) ? [] : imports.map((edge) => ({ from: path, edge }))));

const judged = (config: ConfigData, model: Model, module: ModuleView): boolean => {
  const exposes = exposesOf(config, module);
  return exposes?.kind === 'files' && !(module.parent === model.root && exposes.entry === true);
};

const exposesOf = (config: ConfigData, module: ModuleView): ExposesData | undefined => {
  if (module.kind === 'dir') return config.archetypes[module.archetype!]?.exposes;
  const declared = declarationOf(config, module);
  return declared?.kind === 'files' ? declared.exposes : undefined;
};

const used = (model: Model, module: ModuleView, path: string, name: Export, uses: readonly Use[]): boolean =>
  uses.some(
    ({ from, edge }) =>
      !within(model.moduleOf(from), module) &&
      ((edge.to === name.declared.file && edge.names.includes(name.declared.name)) ||
        ((edge.via ?? edge.to) === path && edge.names.includes('*'))),
  );

const finding = (module: ModuleView, path: string, { name, line, declared }: Export): Finding => ({
  rule: id,
  key: `${id}:${path}#${name}`,
  file: path,
  line,
  value: 1,
  message:
    `${path} exports ${name} on ${module.id}'s surface, but nothing outside ${module.id} imports it. ` +
    `Stop exporting it from ${path}, or keep the file off the surface.`,
  details: { module: module.id, name, declared },
});
