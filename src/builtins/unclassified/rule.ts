import type { Finding, ProjectRule } from '../../domain/rules/rule.ts';

export const unclassified: ProjectRule = {
  id: 'unclassified',
  scope: 'project',
  check: ({ model, atModule }) =>
    model.modules.flatMap((module) =>
      atModule(module).on
        ? module.looseFiles.map((file): Finding => ({
            rule: 'unclassified',
            key: `unclassified:${file}`,
            file,
            line: 1,
            value: 1,
            message:
              `${file} is in no module of ${module.parent ? `${module.id} (${module.archetype})` : 'the root'}, so nothing says what it may import. ` +
              `Add a files module to ${module.archetype} that matches it, or move it into a module's folder.`,
          }))
        : [],
    ),
};
