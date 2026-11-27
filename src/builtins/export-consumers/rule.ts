import type { Declared, FileFacts } from '../../domain/facts/facts.ts';
import type { Model, ModuleView } from '../../domain/model/resolve.ts';
import { type Finding, type ProjectRule, type Site, wholeNumberOptions } from '../../domain/rules/rule.ts';
import { crossed, listed } from '../boundaries.ts';

const id = 'export-consumers';
const defaults = { max: 3 };

interface Export {
  file: string;
  declared: string;
  name: string;
  consumers: Map<ModuleView, Site[]>;
}

export const exportConsumers: ProjectRule<typeof defaults> = {
  id,
  scope: 'project',
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ model, project, atModule }) => {
    const exports = new Map<string, Export>();
    for (const { file, line, target } of uses(model, project.files)) {
      const consumer = crossed(model.moduleOf(target.file)!, model.moduleOf(file)!);
      if (!consumer) continue;
      const name = target.member === undefined ? target.name : `${target.name}#${target.member}`;
      const key = `${target.file}#${name}`;
      const found = exports.get(key) ?? { file: target.file, declared: target.name, name, consumers: new Map() };
      exports.set(key, found);
      found.consumers.set(consumer, [...(found.consumers.get(consumer) ?? []), { file, line }]);
    }
    const lines = new Map(project.files.map((file) => [file.path, file.members.members]));
    return [...exports.values()].flatMap((found): Finding[] => {
      const module = model.moduleOf(found.file)!;
      const { on, options } = atModule(module);
      if (!on || found.consumers.size <= options.max) return [];
      const line = lines.get(found.file)!.find((member) => member.name === found.declared)?.line ?? 1;
      return [finding(found, module, line, options.max)];
    });
  },
};

interface Use {
  file: string;
  line: number;
  target: Declared;
}

const uses = (model: Model, files: readonly FileFacts[]): Use[] => {
  const production = new Set(files.map((file) => file.path).filter((path) => !model.isTest(path)));
  return files
    .filter(({ path }) => production.has(path))
    .flatMap(({ path, chains }) =>
      chains.flatMap(({ line, root, hops }): Use[] => {
        const target = hops[0] ?? (root?.name === '*' ? undefined : root);
        return target && production.has(target.file) ? [{ file: path, line, target }] : [];
      }),
    );
};

const finding = ({ file, name, consumers }: Export, module: ModuleView, line: number, max: number): Finding => {
  const boundaries = [...consumers.keys()].map((consumer) => consumer.id).sort();
  return {
    rule: id,
    key: `${id}:${file}#${name}`,
    file,
    line,
    value: consumers.size,
    limit: max,
    message:
      `${name}, exported by ${module.id}, is used across ${consumers.size} boundaries: ${listed(boundaries)}. ` +
      `Its limit here is ${max}. Give its consumers one way in, or move it to a module meant to be shared and ` +
      `turn ${id} off there.`,
    sites: [...consumers.values()].map(([first]) => first!).toSorted((a, b) => a.file.localeCompare(b.file)),
    parts: boundaries,
    details: {
      module: module.id,
      name,
      consumers: [...consumers].map(([consumer, sites]) => ({
        module: consumer.id,
        files: [...new Set(sites.map((site) => site.file))],
      })),
    },
  };
};
