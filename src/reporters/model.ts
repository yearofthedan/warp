import type { Model, ModuleView } from '../model/archetype/resolve.ts';
import type { ResolvedRules, RulesOf } from '../model/archetype/settings.ts';

export const modelText = (model: Model, rules?: RulesOf): string => {
  const lines: string[] = [];
  const visit = (module: ModuleView, depth: number) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${module.id}  ${heading(module)}  ${contents(module)}`);
    if (rules) lines.push(...changedRules(module, rules).map((line) => `${indent}  ${line}`));
    for (const file of module.looseFiles) lines.push(`${indent}  loose: ${file}`);
    for (const child of module.children) visit(child, depth + 1);
  };
  visit(model.root, 0);
  const files = model.modules.reduce((sum, module) => sum + module.ownFiles.length, 0);
  const loose = model.modules.reduce((sum, module) => sum + module.looseFiles.length, 0);
  lines.push('', `${model.modules.length} modules, ${files} files, ${loose} loose.`);
  return lines.join('\n');
};

const changedRules = (module: ModuleView, rules: RulesOf): string[] => {
  const changes = (resolved: ResolvedRules, from: ResolvedRules) =>
    Object.entries(resolved)
      .filter(([id, setting]) => JSON.stringify(setting) !== JSON.stringify(from[id]))
      .map(([id, setting]) => (setting === false ? `${id} off` : `${id} ${JSON.stringify(setting)}`))
      .join(', ');
  const own = rules.module(module);
  const parts = module.archetype === undefined ? [] : Object.keys(module.parts);
  return [
    ['module', changes(own, module.parent ? rules.module(module.parent) : rules.defaults)],
    ...parts.map((part) => [part, changes(rules.part(module, part), own)]),
  ].flatMap(([where, changed]) => (changed ? [`rules in ${where}: ${changed}`] : []));
};

const heading = (module: ModuleView): string =>
  `${module.part ?? 'root'}: ${module.archetype ?? 'plain folder'}${Object.entries(module.captures)
    .map(([key, value]) => ` {${key}=${value}}`)
    .join('')}`;

const contents = (module: ModuleView): string =>
  module.archetype === undefined
    ? `${module.ownFiles.length} files`
    : Object.entries(module.parts)
        .map(([part, files]) => `${part}: ${files.length}`)
        .join(', ') || 'no files';

const resolvedRules = (module: ModuleView, rules: RulesOf) => ({
  rules: {
    module: rules.module(module),
    parts: Object.fromEntries(Object.keys(module.parts).map((part) => [part, rules.part(module, part)])),
  },
});

export const modelJson = (model: Model, rules?: RulesOf): string =>
  JSON.stringify(
    {
      modules: model.modules.map((module) => ({
        id: module.id,
        part: module.part,
        archetype: module.archetype,
        captures: module.captures,
        parent: module.parent?.id,
        children: module.children.map((child) => child.id),
        ownFiles: module.ownFiles,
        parts: module.parts,
        looseFiles: module.looseFiles,
        ...(rules ? resolvedRules(module, rules) : {}),
      })),
    },
    null,
    2,
  );
