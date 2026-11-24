import { recordedAs } from './builder.ts';
import type { ArchetypeData, ModuleData, RequirementData } from './data.ts';
import type { Draft } from './draft.ts';
import type { Fail } from './shared.ts';

interface Provision {
  archetype: string;
  name: string;
  module: ModuleData;
  used: boolean;
}

interface Walk {
  archetypes: Record<string, ArchetypeData>;
  provisions: Provision[];
  fail: Fail;
  missing: Set<string>;
  visited: Set<string>;
}

const usedRequirements = (drafts: readonly Draft[]): Set<unknown> =>
  new Set(
    drafts
      .flatMap((draft) => [...draft.modules.flatMap((module) => module.using), ...draft.testUsing])
      .map((value) => recordedAs(value, 'ref'))
      .map((ref) => ref?.kind === 'required' && ref.name),
  );

export const checkUnused = (drafts: readonly Draft[], fail: Fail) => {
  for (const draft of drafts.filter((candidate) => !candidate.data.inline)) {
    const inline = drafts.filter((candidate) => candidate.data.name.startsWith(`${draft.data.name}.`));
    const used = usedRequirements([draft, ...inline]);
    for (const name of Object.keys(draft.data.requires)) {
      if (!used.has(name)) fail(`${draft.data.name} requires ${name}, which no module lists in using`);
    }
  }
};

export const checkRequirements = (archetypes: Record<string, ArchetypeData>, root: string, fail: Fail): string[] => {
  const provisions = Object.values(archetypes).flatMap((archetype) =>
    Object.entries(archetype.provides).map(([name, ref]) => ({
      archetype: archetype.name,
      name,
      module: archetype.modules.find((module) => module.name === ref.module)!,
      used: false,
    })),
  );
  walk({ archetypes, provisions, fail, missing: new Set(), visited: new Set() }, archetypes[root]!, '', new Map());
  return provisions
    .filter((p) => !p.used)
    .map((p) => `${p.archetype} provides ${p.name}, which nothing below requires`);
};

const walk = (state: Walk, archetype: ArchetypeData, path: string, above: ReadonlyMap<string, Provision>) => {
  const at = path === '' ? archetype.name : `${path} (${archetype.name})`;
  if (!archetype.inline) {
    for (const [name, requirement] of Object.entries(archetype.requires)) {
      answer(state, at, archetype.name, name, requirement, above.get(name));
    }
  }
  const below = new Map(above);
  for (const provision of state.provisions.filter((p) => p.archetype === archetype.name))
    below.set(provision.name, provision);
  const signature = JSON.stringify([...below].map(([name, provision]) => [name, provision.archetype]));
  for (const module of archetype.modules) {
    if (module.kind !== 'dir' || state.visited.has(`${module.archetype}|${signature}`)) continue;
    state.visited.add(`${module.archetype}|${signature}`);
    walk(state, state.archetypes[module.archetype]!, path === '' ? module.name : `${path}.${module.name}`, below);
  }
};

const answer = (
  state: Walk,
  at: string,
  archetype: string,
  name: string,
  requirement: RequirementData,
  provider: Provision | undefined,
) => {
  if (!provider) {
    if (!state.missing.has(`${archetype}.${name}`))
      state.fail(`${at} requires ${name}, which nothing above it provides`);
    state.missing.add(`${archetype}.${name}`);
    return;
  }
  provider.used = true;
  if (!fits(requirement, provider.module)) {
    state.fail(
      `${at} requires ${name} as ${requirementText(requirement)}; ${provider.archetype} provides ${name} from ${provider.module.name}, ${moduleText(state, provider.module)}`,
    );
  }
};

const moduleText = (state: Walk, module: ModuleData): string => {
  if (module.kind !== 'dir') return `a ${module.kind} module`;
  return state.archetypes[module.archetype]!.inline ? 'a dir module' : `modules of ${module.archetype}`;
};

const requirementText = (requirement: RequirementData): string =>
  requirement.kind === 'archetype' ? `modules of ${requirement.archetype}` : `${requirement.kind}()`;

const fits = (requirement: RequirementData, module: ModuleData): boolean =>
  requirement.kind === 'archetype'
    ? module.kind === 'dir' && module.archetype === requirement.archetype
    : module.kind === requirement.kind;
