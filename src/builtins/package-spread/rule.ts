import { limitOptions, type LimitOptions, listed, packages, within } from '../boundaries.ts';
import { listsPackage } from '../packages.ts';
import type { ExternalImport, FileFacts } from '../../domain/facts/facts.ts';
import { packageText } from '../../domain/model/text.ts';
import type { Model, ModuleView } from '../../domain/model/resolve.ts';
import type { Finding, ProjectRule, Site } from '../../domain/rules/rule.ts';

const id = 'package-spread';

const defaults: LimitOptions = { max: 2, ignore: [] };

interface Use {
  file: string;
  external: ExternalImport;
}

export const packageSpread: ProjectRule<LimitOptions> = {
  id,
  scope: 'project',
  defaults,
  parseOptions: limitOptions(defaults, packages),
  check: ({ model, project, atModule }) => {
    const uses = packageUses(model, project.files);
    return model.modules.flatMap((module): Finding[] => {
      const { on, options } = atModule(module);
      if (!on) return [];
      const patterns = options.ignore.map((entry) => (entry.startsWith('npm:') ? entry.slice('npm:'.length) : entry));
      const counted = uses.filter(({ external }) => !patterns.some((pattern) => listsPackage(pattern, external)));
      return [...spreads(model, module, counted)]
        .filter(([, children]) => children.size > options.max)
        .map(([name, children]) => finding(name, children, module, options.max));
    });
  },
};

const counts = (external: ExternalImport): boolean => !external.typeOnly && !external.reExport;

const packageUses = (model: Model, files: readonly FileFacts[]): Use[] =>
  files.flatMap(({ path, externals }) =>
    model.isTest(path) ? [] : externals.filter(counts).map((external) => ({ file: path, external })),
  );

const spreads = (model: Model, module: ModuleView, uses: readonly Use[]) => {
  const found = new Map<string, Map<ModuleView, Site[]>>();
  for (const { file, external } of uses) {
    const child = module.children.find((candidate) => !candidate.test && within(model.moduleOf(file), candidate));
    if (!child) continue;
    const children = found.get(external.package) ?? new Map<ModuleView, Site[]>();
    found.set(external.package, children);
    children.set(child, [...(children.get(child) ?? []), { file, line: external.line }]);
  }
  return found;
};

const finding = (name: string, children: Map<ModuleView, Site[]>, module: ModuleView, max: number): Finding => {
  const named = [...children.keys()].map((child) => child.id).sort();
  const sites = [...children.values()].map(([first]) => first!).toSorted((a, b) => a.file.localeCompare(b.file));
  return {
    rule: id,
    key: `${id}:${module.id}:${name}`,
    file: sites[0]!.file,
    line: sites[0]!.line,
    value: children.size,
    limit: max,
    message:
      `${children.size} of ${module.id}'s modules import ${name}: ${listed(named)}. Its limit here is ${max}. ` +
      `Wrap ${name} in the one module that should own it and let the others go through that module, or name ` +
      `${packageText(name)} in ${id}'s ignore on ${module.id} if it is meant to be used everywhere.`,
    sites,
    parts: named,
    details: {
      module: module.id,
      package: name,
      children: [...children].map(([child, sites]) => ({
        module: child.id,
        files: [...new Set(sites.map((site) => site.file))],
      })),
    },
  };
};
