import type { Model, UnitView } from '../model/archetype/resolve.ts';
import type { ResolvedRules, RulesOf } from '../model/archetype/settings.ts';

export const modelText = (model: Model, rules?: RulesOf): string => {
  const lines: string[] = [];
  const visit = (unit: UnitView, depth: number) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${unit.id}  ${heading(unit)}  ${contents(unit)}`);
    if (rules) lines.push(...changedRules(unit, rules).map((line) => `${indent}  ${line}`));
    for (const file of unit.looseFiles) lines.push(`${indent}  loose (${unit.loose}): ${file}`);
    for (const child of unit.children) visit(child, depth + 1);
  };
  visit(model.root, 0);
  const files = model.units.reduce((sum, unit) => sum + unit.ownFiles.length, 0);
  const loose = model.units.reduce((sum, unit) => sum + unit.looseFiles.length, 0);
  lines.push('', `${model.units.length} units, ${files} files, ${loose} loose.`);
  return lines.join('\n');
};

const changedRules = (unit: UnitView, rules: RulesOf): string[] => {
  const changes = (resolved: ResolvedRules, from: ResolvedRules) =>
    Object.entries(resolved)
      .filter(([id, setting]) => JSON.stringify(setting) !== JSON.stringify(from[id]))
      .map(([id, setting]) => (setting === false ? `${id} off` : `${id} ${JSON.stringify(setting)}`))
      .join(', ');
  const own = rules.unit(unit);
  const parts = unit.archetype === undefined ? [] : Object.keys(unit.parts);
  return [
    ['unit', changes(own, unit.parent ? rules.unit(unit.parent) : rules.defaults)],
    ...parts.map((part) => [part, changes(rules.part(unit, part), own)]),
  ].flatMap(([where, changed]) => (changed ? [`rules in ${where}: ${changed}`] : []));
};

const heading = (unit: UnitView): string =>
  `${unit.part ?? 'root'}: ${unit.archetype ?? 'plain folder'}${Object.entries(unit.captures)
    .map(([key, value]) => ` {${key}=${value}}`)
    .join('')}`;

const contents = (unit: UnitView): string =>
  unit.archetype === undefined
    ? `${unit.ownFiles.length} files`
    : Object.entries(unit.parts)
        .map(([part, files]) => `${part}: ${files.length}`)
        .join(', ') || 'no files';

const resolvedRules = (unit: UnitView, rules: RulesOf) => ({
  rules: {
    unit: rules.unit(unit),
    parts: Object.fromEntries(Object.keys(unit.parts).map((part) => [part, rules.part(unit, part)])),
  },
});

export const modelJson = (model: Model, rules?: RulesOf): string =>
  JSON.stringify(
    {
      units: model.units.map((unit) => ({
        id: unit.id,
        part: unit.part,
        archetype: unit.archetype,
        captures: unit.captures,
        parent: unit.parent?.id,
        children: unit.children.map((child) => child.id),
        ownFiles: unit.ownFiles,
        parts: unit.parts,
        loose: unit.loose,
        looseFiles: unit.looseFiles,
        ...(rules ? resolvedRules(unit, rules) : {}),
      })),
    },
    null,
    2,
  );
