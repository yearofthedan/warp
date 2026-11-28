import type { FileFacts } from '../../domain/facts/facts.ts';
import type { ModuleView } from '../../domain/model/resolve.ts';
import { type Finding, type ProjectRule, wholeNumberOptions } from '../../domain/rules/rule.ts';
import { within } from '../boundaries.ts';

const id = 'export-surface';
const defaults = { max: 20 };

interface Name {
  file: string;
  name: string;
  value: boolean;
}

interface Use extends Name {
  from: string;
}

export const exportSurface: ProjectRule<typeof defaults> = {
  id,
  scope: 'project',
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ model, project, atModule }) => {
    const production = new Set(project.files.map((file) => file.path).filter((path) => !model.isTest(path)));
    const uses = project.files.flatMap((file) => (production.has(file.path) ? usesIn(file, production) : []));
    return model.modules.flatMap((module): Finding[] => {
      const { on, options } = atModule(module);
      if (!on) return [];
      const names = surface(module, uses, (file) => model.moduleOf(file));
      return names.length > options.max ? [finding(module, names, options.max)] : [];
    });
  },
};

const usesIn = ({ path, imports, chains }: FileFacts, production: ReadonlySet<string>): Use[] => [
  ...imports
    .filter((edge) => !edge.reExport && production.has(edge.to))
    .flatMap((edge) =>
      edge.names
        .filter((name) => name !== '*')
        .map((name) => ({ from: path, file: edge.to, name, value: !edge.typeOnly })),
    ),
  ...chains.flatMap(({ root, hops: [member] }) =>
    root?.name === '*' && member && production.has(member.file)
      ? [{ from: path, file: member.file, name: member.name, value: true }]
      : [],
  ),
];

const surface = (
  module: ModuleView,
  uses: readonly Use[],
  moduleOf: (file: string) => ModuleView | undefined,
): Name[] => {
  const names = new Map<string, Name>();
  for (const { from, file, name, value } of uses) {
    if (!within(moduleOf(file), module) || within(moduleOf(from), module)) continue;
    const key = `${file}#${name}`;
    const known = names.get(key);
    names.set(key, { file, name, value: value || (known?.value ?? false) });
  }
  return [...names.values()].toSorted((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
};

const finding = (module: ModuleView, names: readonly Name[], max: number): Finding => {
  const values = names.filter((name) => name.value).length;
  const byFile = Map.groupBy(names, (name) => name.file);
  const [widest] = [...byFile].toSorted(([, a], [, b]) => b.length - a.length);
  return {
    rule: id,
    key: `${id}:${module.id}`,
    file: widest![0],
    line: 1,
    value: names.length,
    limit: max,
    message:
      `${module.id} offers ${names.length} names that other modules use (${counted(values, 'value')}, ${counted(names.length - values, 'type')}). ` +
      `Its limit here is ${max}. Split it, or give it a smaller front.`,
    details: {
      module: module.id,
      values,
      types: names.length - values,
      files: [...byFile].map(([file, found]) => ({ file, names: found.map((name) => name.name) })),
    },
  };
};

const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;
