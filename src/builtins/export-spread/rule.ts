import type { Model, ModuleView } from '../../domain/model/resolve.ts';
import type { Finding, ProjectRule, Site } from '../../domain/rules/rule.ts';
import { ignored, limitOptions, type LimitOptions, listed, type Use, valueUses, within } from '../boundaries.ts';

const id = 'export-spread';

const defaults: LimitOptions = { max: 2, ignore: [] };

interface Spread {
  file: string;
  name: string;
  children: Map<ModuleView, Site[]>;
}

export const exportSpread: ProjectRule<LimitOptions> = {
  id,
  scope: 'project',
  defaults,
  parseOptions: limitOptions(defaults),
  check: ({ model, project, atModule }) => {
    const uses = valueUses(model, project.files);
    return model.modules.flatMap((module): Finding[] => {
      if (module.test || module.children.length === 0) return [];
      const { on, options } = atModule(module);
      if (!on) return [];
      const skip = ignored(model, options.ignore, `${id} at ${module.id}`);
      return [...spreads(model, module, uses, skip).values()]
        .filter((spread) => spread.children.size > options.max)
        .map((spread) => finding(spread, module, model.moduleOf(spread.file)!, options.max));
    });
  },
};

const outside = (target: ModuleView, module: ModuleView, skip: readonly ModuleView[]): boolean =>
  !within(target, module) && !skip.some((holder) => within(target, holder));

const spreads = (model: Model, module: ModuleView, uses: readonly Use[], skip: readonly ModuleView[]) => {
  const found = new Map<string, Spread>();
  for (const { file, edge, name } of uses) {
    if (!outside(model.moduleOf(edge.to)!, module, skip)) continue;
    const child = module.children.find((candidate) => !candidate.test && within(model.moduleOf(file), candidate));
    if (!child) continue;
    const key = `${edge.to}#${name}`;
    const spread = found.get(key) ?? { file: edge.to, name, children: new Map() };
    found.set(key, spread);
    spread.children.set(child, [...(spread.children.get(child) ?? []), { file, line: edge.line }]);
  }
  return found;
};

const finding = ({ file, name, children }: Spread, module: ModuleView, exporter: ModuleView, max: number): Finding => {
  const named = [...children.keys()].map((child) => child.id).sort();
  const sites = [...children.values()]
    .map(([first]) => first!)
    .toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    rule: id,
    key: `${id}:${module.id}:${file}#${name}`,
    file: sites[0]!.file,
    line: sites[0]!.line,
    value: children.size,
    limit: max,
    message:
      `${children.size} of ${module.id}'s modules use ${name} from ${exporter.id}: ${listed(named)}. ` +
      `Its limit here is ${max}. Give the use to the one module that should own it and let the others go through ` +
      `that module, or add ${exporter.id} to ${id}'s ignore list on ${module.id} if it is meant to be shared.`,
    sites,
    parts: named,
    details: {
      module: module.id,
      exporter: exporter.id,
      file,
      name,
      children: [...children].map(([child, uses]) => ({
        module: child.id,
        files: [...new Set(uses.map((use) => use.file))],
      })),
    },
  };
};
