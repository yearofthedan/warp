import type { Model, UnitView } from '../model/archetype/resolve.ts';

export const modelText = (model: Model): string => {
  const lines: string[] = [];
  const visit = (unit: UnitView, depth: number) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${unit.id}  ${heading(unit)}  ${contents(unit)}`);
    for (const file of unit.looseFiles) lines.push(`${indent}  loose (${unit.loose}): ${file}`);
    for (const child of unit.children) visit(child, depth + 1);
  };
  visit(model.root, 0);
  const files = model.units.reduce((sum, unit) => sum + unit.ownFiles.length, 0);
  const loose = model.units.reduce((sum, unit) => sum + unit.looseFiles.length, 0);
  lines.push('', `${model.units.length} units, ${files} files, ${loose} loose.`);
  return lines.join('\n');
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

export const modelJson = (model: Model): string =>
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
      })),
    },
    null,
    2,
  );
