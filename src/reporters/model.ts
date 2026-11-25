import type { Model, ModuleView } from '../model/archetype/resolve.ts';
import type { ResolvedRules, RulesOf } from '../model/archetype/settings.ts';

export const modelText = (model: Model, rules?: RulesOf): string => {
  const lines: string[] = [];
  const visit = (module: ModuleView, depth: number) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${module.id}  ${heading(module)}`);
    if (rules) {
      const changed = changedRules(module, rules);
      if (changed) lines.push(`${indent}  rules: ${changed}`);
    }
    for (const file of module.looseFiles) lines.push(`${indent}  loose: ${file}`);
    for (const child of module.children) visit(child, depth + 1);
  };
  visit(model.root, 0);
  const total = (modules: readonly ModuleView[]) => modules.reduce((sum, module) => sum + module.files.length, 0);
  const files = total(model.modules.filter((module) => !module.test));
  const tests = total(model.modules.filter((module) => module.test));
  const loose = model.modules.reduce((sum, module) => sum + module.looseFiles.length, 0);
  const tested = tests > 0 ? `, ${count(tests, 'test file')}` : '';
  lines.push('', `${model.modules.length} modules, ${files} files${tested}, ${loose} loose.`);
  return lines.join('\n');
};

const changedRules = (module: ModuleView, rules: RulesOf): string => {
  const resolved = rules.module(module);
  const from: ResolvedRules = module.parent ? rules.module(module.parent) : rules.defaults;
  return Object.entries(resolved)
    .filter(([id, setting]) => JSON.stringify(setting) !== JSON.stringify(from[id]))
    .map(([id, setting]) => (setting === false ? `${id} off` : `${id} ${JSON.stringify(setting)}`))
    .join(', ');
};

const count = (n: number, noun = 'file'): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

const heading = (module: ModuleView): string => {
  const owned = module.files.length - module.looseFiles.length;
  if (module.kind === 'files') return count(owned);
  if (module.kind === 'test') return count(owned, 'test file');
  const captures = Object.entries(module.captures)
    .map(([key, value]) => ` {${key}=${value}}`)
    .join('');
  const contents = owned > 0 ? `, ${count(owned, module.test ? 'test file' : 'file')}` : '';
  return `${module.name ?? 'root'}: ${module.archetype}${captures}${contents}`;
};

export const modelJson = (model: Model, rules?: RulesOf): string =>
  JSON.stringify(
    {
      modules: model.modules.map((module) => ({
        id: module.id,
        name: module.name,
        kind: module.kind,
        ...(module.test ? { test: true } : {}),
        archetype: module.archetype,
        captures: module.captures,
        parent: module.parent?.id,
        children: module.children.map((child) => child.id),
        files: module.files,
        looseFiles: module.looseFiles,
        ...(rules ? { rules: rules.module(module) } : {}),
      })),
    },
    null,
    2,
  );
