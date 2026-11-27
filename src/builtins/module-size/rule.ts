import type { ModuleView } from '../../domain/model/resolve.ts';
import { type Finding, type ProjectRule, wholeNumberOptions } from '../../domain/rules/rule.ts';

const id = 'module-size';
const defaults = { max: 1000 };

interface Sized {
  file: string;
  lines: number;
}

export const moduleSize: ProjectRule<typeof defaults> = {
  id,
  scope: 'project',
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ model, project, atModule }) => {
    const lines = new Map(project.files.map((file) => [file.path, file.lines]));
    return model.modules.flatMap((module): Finding[] => {
      if (module.test) return [];
      const { on, options } = atModule(module);
      if (!on) return [];
      const files = module.files
        .filter((file) => lines.has(file))
        .map((file) => ({ file, lines: lines.get(file)! }))
        .toSorted((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
      const total = files.reduce((sum, file) => sum + file.lines, 0);
      return total > options.max ? [finding(module, files, total, options.max)] : [];
    });
  },
};

const finding = (module: ModuleView, files: readonly Sized[], total: number, max: number): Finding => ({
  rule: id,
  key: `${id}:${module.id}`,
  file: files[0]!.file,
  line: 1,
  value: total,
  limit: max,
  message:
    `${module.id} holds ${total} lines in its own files (limit ${max}): ` +
    `${files.map(({ file, lines }) => `${file} ${lines}`).join(', ')}. ` +
    'Split it into modules that each hold one responsibility.',
  details: { module: module.id, files },
});
