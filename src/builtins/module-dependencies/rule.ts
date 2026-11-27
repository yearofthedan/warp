import type { FileFacts } from '../../domain/facts/facts.ts';
import type { Model, ModuleView } from '../../domain/model/resolve.ts';
import type { Finding, ProjectRule, Site } from '../../domain/rules/rule.ts';
import { crossed, ignored, limitOptions, type LimitOptions, listed, within } from '../boundaries.ts';

const id = 'module-dependencies';
const defaults: LimitOptions = { max: 4, ignore: [] };

interface Import {
  file: string;
  to: string;
  line: number;
}

export const moduleDependencies: ProjectRule<LimitOptions> = {
  id,
  scope: 'project',
  defaults,
  moduleOptions: ['ignore'],
  parseOptions: limitOptions(defaults),
  check: ({ model, project, atModule }) => {
    const imports = productionImports(model, project.files);
    return model.modules.flatMap((module): Finding[] => {
      const { on, options } = atModule(module);
      if (!on) return [];
      const boundaries = crossings(model, module, imports, ignored(model, options.ignore));
      return boundaries.size > options.max ? [finding(module, boundaries, options.max)] : [];
    });
  },
};

const crossings = (model: Model, module: ModuleView, imports: readonly Import[], skip: readonly ModuleView[]) => {
  const boundaries = new Map<ModuleView, Site[]>();
  for (const { file, to, line } of imports) {
    const target = model.moduleOf(to)!;
    if (!within(model.moduleOf(file), module) || within(target, module)) continue;
    if (skip.some((holder) => within(target, holder))) continue;
    const boundary = crossed(module, target)!;
    boundaries.set(boundary, [...(boundaries.get(boundary) ?? []), { file, line }]);
  }
  return boundaries;
};

const productionImports = (model: Model, files: readonly FileFacts[]): Import[] => {
  const production = new Set(files.map((file) => file.path).filter((path) => !model.isTest(path)));
  return files
    .filter(({ path }) => production.has(path))
    .flatMap(({ path, imports }) =>
      imports
        .map((edge) => ({ file: path, to: edge.via ?? edge.to, line: edge.line }))
        .filter(({ to }) => production.has(to)),
    );
};

const finding = (module: ModuleView, boundaries: Map<ModuleView, Site[]>, max: number): Finding => {
  const named = [...boundaries.keys()].map((boundary) => boundary.id).sort();
  const sites = [...boundaries.values()]
    .map(([first]) => first!)
    .toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    rule: id,
    key: `${id}:${module.id}`,
    file: sites[0]!.file,
    line: sites[0]!.line,
    value: boundaries.size,
    limit: max,
    message:
      `${module.id} imports across ${boundaries.size} boundaries: ${listed(named)}. Its limit here is ${max}. ` +
      'Split it along what each part depends on, or reach some of them through one module. A module meant to wire ' +
      `everything together, such as a composition root, turns ${id} off or raises its max.`,
    sites,
    parts: named,
    details: {
      module: module.id,
      boundaries: [...boundaries].map(([boundary, uses]) => ({
        module: boundary.id,
        files: [...new Set(uses.map((use) => use.file))],
      })),
    },
  };
};
