import { recordedAs } from './builder.ts';
import type { ArchetypeData, PartData, RequirementData } from './data.ts';
import type { Draft } from './draft.ts';
import { archetypeOf, type Fail, shapeText } from './shared.ts';

interface Provision {
  archetype: string;
  name: string;
  part: PartData;
  used: boolean;
}

interface Walk {
  archetypes: Record<string, ArchetypeData>;
  provisions: Provision[];
  fail: Fail;
  missing: Set<string>;
  visited: Set<string>;
}

export const checkUnused = ({ data, parts }: Draft, fail: Fail) => {
  const used = new Set(
    parts
      .flatMap((part) => part.using.map((value) => recordedAs(value, 'ref')))
      .map((ref) => ref?.kind === 'required' && ref.name),
  );
  for (const name of Object.keys(data.requires)) {
    if (!used.has(name)) fail(`${data.name} requires ${name}, which no part lists in using`);
  }
};

export const checkRequirements = (archetypes: Record<string, ArchetypeData>, root: string, fail: Fail): string[] => {
  const provisions = Object.values(archetypes).flatMap((archetype) =>
    Object.entries(archetype.provides).map(([name, ref]) => ({
      archetype: archetype.name,
      name,
      part: archetype.parts.find((part) => part.name === ref.part)!,
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
  for (const [name, requirement] of Object.entries(archetype.requires)) {
    answer(state, at, archetype.name, name, requirement, above.get(name));
  }
  const below = new Map(above);
  for (const provision of state.provisions.filter((p) => p.archetype === archetype.name))
    below.set(provision.name, provision);
  const signature = JSON.stringify([...below].map(([name, provision]) => [name, provision.archetype]));
  for (const part of archetype.parts) {
    const child = archetypeOf(part);
    if (child === undefined || state.visited.has(`${child}|${signature}`)) continue;
    state.visited.add(`${child}|${signature}`);
    walk(state, state.archetypes[child]!, path === '' ? part.name : `${path}.${part.name}`, below);
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
  if (!fits(requirement, provider.part)) {
    state.fail(
      `${at} requires ${name} as ${requirementText(requirement)}; ${provider.archetype} provides ${name} from ${provider.part.name}, ${partText(provider.part)}`,
    );
  }
};

const partText = (part: PartData): string => {
  const archetype = archetypeOf(part);
  return archetype !== undefined ? `modules of ${archetype}` : shapeText(part.kind);
};

const requirementText = (requirement: RequirementData): string =>
  requirement.kind === 'archetype'
    ? `modules of ${requirement.archetype}`
    : `${shapeText(requirement.kind)} (${requirement.kind}())`;

const fits = (requirement: RequirementData, part: PartData): boolean =>
  requirement.kind === 'archetype'
    ? archetypeOf(part) === requirement.archetype
    : part.kind === requirement.kind && archetypeOf(part) === undefined;
