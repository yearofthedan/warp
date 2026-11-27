import type { ModuleView } from '../../domain/model/resolve.ts';
import { type Finding, type ProjectRule, type Site, wholeNumberOptions } from '../../domain/rules/rule.ts';
import { crossed, listed, valueUses } from '../boundaries.ts';

const id = 'export-consumers';
const defaults = { max: 3 };

interface Export {
  file: string;
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
    for (const { file, edge, name } of valueUses(model, project.files)) {
      const consumer = crossed(model.moduleOf(edge.to)!, model.moduleOf(file)!);
      if (!consumer) continue;
      const key = `${edge.to}#${name}`;
      const found = exports.get(key) ?? { file: edge.to, name, consumers: new Map() };
      exports.set(key, found);
      found.consumers.set(consumer, [...(found.consumers.get(consumer) ?? []), { file, line: edge.line }]);
    }
    const lines = new Map(project.files.map((file) => [file.path, file.members.members]));
    return [...exports.values()].flatMap((found): Finding[] => {
      const module = model.moduleOf(found.file)!;
      const { on, options } = atModule(module);
      if (!on || found.consumers.size <= options.max) return [];
      const line = lines.get(found.file)?.find((member) => member.name === found.name)?.line ?? 1;
      return [finding(found, module, line, options.max)];
    });
  },
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
    sites: [...consumers.values()]
      .map(([first]) => first!)
      .toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
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
