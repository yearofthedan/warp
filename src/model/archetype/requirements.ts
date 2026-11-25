import type { ArchetypeData, DirModuleData, RefData } from './data.ts';
import type { PendingRef } from './language.ts';
import { exposedProblem, show } from './references.ts';
import type { Fail } from './shared.ts';

interface Site {
  holder: ArchetypeData;
  module: DirModuleData;
}

const namedOf = (archetype: string): string => archetype.split('.')[0]!;

const sitesOf = (archetypes: Record<string, ArchetypeData>): Site[] =>
  Object.values(archetypes).flatMap((holder) =>
    holder.modules
      .filter((module): module is DirModuleData => module.kind === 'dir' && !archetypes[module.archetype]?.inline)
      .map((module) => ({ holder, module })),
  );

export const markTests = (archetypes: Record<string, ArchetypeData>, fail: Fail) => {
  const sites = sitesOf(archetypes);
  for (const archetype of Object.values(archetypes).filter((candidate) => !candidate.inline)) {
    const using = sites.filter((site) => site.module.archetype === archetype.name);
    const tests = using.filter((site) => site.module.test).length;
    if (tests === 0) continue;
    if (tests < using.length)
      fail(`${archetype.name} is used by production and test modules; an archetype holds one or the other`);
    else archetype.test = true;
  }
  for (const archetype of Object.values(archetypes))
    if (archetype.inline && archetypes[namedOf(archetype.name)]?.test) archetype.test = true;
};

export const checkInputs = (archetypes: Record<string, ArchetypeData>, pending: readonly PendingRef[], fail: Fail) => {
  const uses = pending.filter((entry) => entry.ref.kind === 'required');
  const usesOf = (archetype: string) => uses.filter((entry) => namedOf(entry.archetype) === archetype);
  for (const archetype of Object.values(archetypes).filter((candidate) => !candidate.inline)) {
    const used = new Set(usesOf(archetype.name).map((entry) => (entry.ref as { name: string }).name));
    for (const name of [...archetype.requires, ...(archetype.testRequires ?? [])].filter((input) => !used.has(input)))
      fail(`${archetype.name} requires ${name}, which none of its modules names in dependencies`);
  }
  for (const site of sitesOf(archetypes)) {
    const archetype = archetypes[site.module.archetype];
    if (archetype) checkSite(archetypes, site, archetype, usesOf(archetype.name), fail);
  }
};

const checkSite = (
  archetypes: Record<string, ArchetypeData>,
  { holder, module }: Site,
  archetype: ArchetypeData,
  uses: readonly PendingRef[],
  fail: Fail,
) => {
  const where = `${holder.name}.${module.name}`;
  for (const name of archetype.requires.filter((input) => !module.inputs?.[input]))
    fail(`${where} uses ${archetype.name}, which requires ${name}; ${binding(module.inputs, name, where)}`);
  for (const name of (archetype.testRequires ?? []).filter((input) => !module.testInputs?.[input]))
    fail(`${where} uses ${archetype.name}, whose tests require ${name}; name it in ${where}.test.dependencies`);
  const bound = { ...module.inputs, ...module.testInputs };
  for (const entry of uses) {
    const ref = entry.ref as { name: string; surface?: string };
    const given = bound[ref.name];
    if (!given || ref.surface === undefined) continue;
    const problem = surfaceProblem(archetypes, holder, given, ref.surface, entry.tests);
    if (problem)
      fail(`${entry.where}: '${ref.name}.${ref.surface}': ${where} binds ${ref.name} to ${show(given)}; ${problem}`);
  }
};

const binding = (inputs: Record<string, RefData> | undefined, name: string, where: string): string =>
  inputs?.[`npm:${name}`]
    ? `bind the package by name in ${where}.dependencies, { ${name}: npm:${name} }`
    : `name it in ${where}.dependencies`;

const archetypeAt = (archetypes: Record<string, ArchetypeData>, holder: ArchetypeData, up: number): ArchetypeData =>
  archetypes[
    holder.name
      .split('.')
      .slice(0, Math.max(holder.name.split('.').length - up, 1))
      .join('.')
  ]!;

const surfaceProblem = (
  archetypes: Record<string, ArchetypeData>,
  holder: ArchetypeData,
  binding: RefData,
  surface: string,
  tests: boolean,
): string | undefined => {
  if (binding.kind === 'package') return `a package has no surfaces`;
  if (binding.surface !== undefined) return `${show(binding)} is a surface already`;
  if (binding.kind === 'required') return undefined;
  const at = archetypeAt(archetypes, holder, binding.up ?? 0);
  const module = at.modules.find((candidate) => candidate.name === binding.module);
  if (module?.kind !== 'dir') return `${binding.module} has no named surfaces`;
  const inside = archetypes[module.archetype]!;
  return exposedProblem(
    binding.module,
    { exposes: inside.exposes, testExposes: Object.keys(inside.testExposes ?? {}) },
    surface,
    tests,
  );
};
