import { ConfigError } from '../configError.ts';
import type { ArchetypeData, ConfigData, DirPartData } from './data.ts';

export interface Folders {
  folders(dir: string): string[];
  exists(path: string): boolean;
}

export interface UnitView {
  id: string;
  dir: string;
  part?: string;
  archetype?: string;
  captures: Record<string, string>;
  parent?: UnitView;
  children: UnitView[];
  ownFiles: string[];
  parts: Record<string, string[]>;
  looseFiles: string[];
}

export interface Model {
  root: UnitView;
  units: UnitView[];
  unitOf(file: string): UnitView | undefined;
  partOf(file: string): string | undefined;
}

interface Claim {
  part: DirPartData;
  path: string;
  archetype?: ArchetypeData;
  dir: string;
  captures: Record<string, string>;
  rank: number[];
}

interface Resolution {
  config: ConfigData;
  folders: Folders;
  units: UnitView[];
  byDir: Map<string, UnitView>;
  errors: Set<string>;
}

const placeholders = /\{(\w+)\}/g;

const join = (dir: string, name: string): string => (dir === '' ? name : `${dir}/${name}`);
const parentDir = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

const fill = (pattern: string, captures: Record<string, string>): { filled: string } | { missing: string } => {
  const missing = [...pattern.matchAll(placeholders)].find(([, key]) => !Object.hasOwn(captures, key!))?.[1];
  if (missing !== undefined) return { missing };
  return { filled: pattern.replace(placeholders, (_, key: string) => captures[key]!) };
};

export const resolveModel = (config: ConfigData, folders: Folders, files: readonly string[]): Model => {
  const resolution: Resolution = { config, folders, units: [], byDir: new Map(), errors: new Set() };
  const root = build(resolution, { dir: '', archetype: config.archetypes[config.root], captures: {} });
  const unitOf = new Map<string, UnitView>();
  const partOf = new Map<string, string>();
  for (const file of [...files].sort()) {
    const unit = deepest(resolution.byDir, file);
    unitOf.set(file, unit);
    unit.ownFiles.push(file);
    const part = unit.archetype === undefined ? undefined : filesPart(resolution, unit, file);
    if (part !== undefined) {
      (unit.parts[part] ??= []).push(file);
      partOf.set(file, part);
    } else if (unit.archetype !== undefined) unit.looseFiles.push(file);
  }
  if (resolution.errors.size > 0) throw new ConfigError([...resolution.errors].join('\n'));
  for (const unit of resolution.units) if (unit.archetype !== undefined) unit.parts = inDeclarationOrder(config, unit);
  return {
    root,
    units: resolution.units,
    unitOf: (file) => unitOf.get(file),
    partOf: (file) => partOf.get(file),
  };
};

const inDeclarationOrder = (config: ConfigData, unit: UnitView): Record<string, string[]> =>
  Object.fromEntries(
    config.archetypes[unit.archetype!]!.parts.flatMap((part) =>
      unit.parts[part.name] ? [[part.name, unit.parts[part.name]!]] : [],
    ),
  );

interface Found {
  dir: string;
  archetype?: ArchetypeData;
  captures: Record<string, string>;
  parent?: UnitView;
  part?: string;
}

const build = (resolution: Resolution, { dir, archetype, captures, parent, part }: Found): UnitView => {
  const unit: UnitView = {
    id: dir === '' ? '.' : dir,
    dir,
    ...(part === undefined ? {} : { part }),
    ...(archetype === undefined ? {} : { archetype: archetype.name }),
    captures,
    ...(parent === undefined ? {} : { parent }),
    children: [],
    ownFiles: [],
    parts: {},
    looseFiles: [],
  };
  resolution.units.push(unit);
  resolution.byDir.set(dir, unit);
  if (archetype === undefined) return unit;
  for (const [childDir, claims] of [...claimsIn(resolution, unit, archetype)].sort(([a], [b]) => a.localeCompare(b))) {
    const winner = mostSpecific(resolution, archetype, childDir, claims);
    const existing = resolution.byDir.get(childDir);
    if (existing) {
      resolution.errors.add(
        `${childDir}: found as a unit of ${partPath(unit, winner.part.name)} and of ${existing.part}; one folder is one unit`,
      );
      continue;
    }
    unit.children.push(
      build(resolution, {
        dir: childDir,
        archetype: winner.archetype,
        captures: winner.captures,
        parent: unit,
        part: partPath(unit, winner.part.name),
      }),
    );
  }
  return unit;
};

const partPath = (unit: UnitView, part: string): string => (unit.part === undefined ? part : `${unit.part}.${part}`);

const claimsIn = (resolution: Resolution, unit: UnitView, archetype: ArchetypeData): Map<string, Claim[]> => {
  const claims = new Map<string, Claim[]>();
  for (const part of archetype.parts) {
    if (part.kind !== 'dir') continue;
    for (const claim of claimsOf(resolution, unit, part))
      claims.set(claim.dir, [...(claims.get(claim.dir) ?? []), claim]);
  }
  return claims;
};

const claimsOf = (resolution: Resolution, unit: UnitView, part: DirPartData): Claim[] => {
  const child = part.archetype === undefined ? undefined : resolution.config.archetypes[part.archetype];
  return part.paths.flatMap((path) =>
    matchFolders(resolution.folders, unit.dir, path).flatMap((match) => {
      const captures = identify(resolution, child, match.dir, match.captures, unit);
      return captures ? [{ part, path, ...(child ? { archetype: child } : {}), ...match, captures }] : [];
    }),
  );
};

const matchFolders = (folders: Folders, base: string, path: string) => {
  let found = [{ dir: base, captures: {} as Record<string, string>, rank: [] as number[] }];
  for (const segment of path.split('/')) {
    const capture = segment.startsWith('{') ? segment.slice(1, -1) : undefined;
    found = found.flatMap(({ dir, captures, rank }) =>
      folders
        .folders(dir)
        .filter((name) => capture !== undefined || name === segment)
        .map((name) => ({
          dir: join(dir, name),
          captures: capture === undefined ? captures : { ...captures, [capture]: name },
          rank: [...rank, capture === undefined ? 1 : 0],
        })),
    );
  }
  return found;
};

const identify = (
  resolution: Resolution,
  archetype: ArchetypeData | undefined,
  dir: string,
  captures: Record<string, string>,
  parent: UnitView,
): Record<string, string> | undefined => {
  const how = archetype?.identify;
  if (how === undefined) return captures;
  if ('match' in how) {
    const matched = how.match(dir, chain(parent));
    return matched === false ? undefined : { ...captures, ...matched };
  }
  const marker = fill(how.marker, captures);
  if ('missing' in marker) {
    resolution.errors.add(
      `${dir}: ${archetype!.name}'s marker '${how.marker}' names {${marker.missing}}, which its dir path doesn't capture`,
    );
    return undefined;
  }
  return resolution.folders.exists(join(dir, marker.filled)) ? captures : undefined;
};

const chain = (unit: UnitView): UnitView[] => (unit.parent ? [...chain(unit.parent), unit] : [unit]);

const compareRanks = (a: readonly number[], b: readonly number[]): number => {
  const index = a.findIndex((value, at) => value !== b[at]);
  return index < 0 ? 0 : a[index]! - b[index]!;
};

const mostSpecific = (resolution: Resolution, archetype: ArchetypeData, dir: string, claims: Claim[]): Claim => {
  const best = claims.reduce((top, claim) => (compareRanks(claim.rank, top.rank) > 0 ? claim : top));
  const tied = claims.filter((claim) => claim.part !== best.part && compareRanks(claim.rank, best.rank) === 0);
  if (tied.length > 0) {
    const names = [best, ...tied].map((claim) => `${claim.part.name} ('${claim.path}')`).join(' and ');
    resolution.errors.add(
      `${dir}: ${archetype.name}'s dir parts ${names} are equally specific; narrow one of the paths`,
    );
  }
  return best;
};

const deepest = (byDir: ReadonlyMap<string, UnitView>, file: string): UnitView => {
  for (let dir = parentDir(file); ; dir = parentDir(dir)) {
    const unit = byDir.get(dir);
    if (unit) return unit;
  }
};

const filesPart = (resolution: Resolution, unit: UnitView, file: string): string | undefined => {
  const archetype = resolution.config.archetypes[unit.archetype!]!;
  const path = unit.dir === '' ? file : file.slice(unit.dir.length + 1);
  const matches: { part: string; pattern: string; score: number }[] = [];
  for (const part of archetype.parts) {
    if (part.kind !== 'files') continue;
    for (const pattern of part.patterns) {
      const filled = fill(pattern, unit.captures);
      if ('missing' in filled) {
        resolution.errors.add(
          `${unit.id}: ${archetype.name}.${part.name} '${pattern}' names {${filled.missing}}, which ${unit.id} doesn't capture`,
        );
      } else if (globRegex(filled.filled).test(path))
        matches.push({ part: part.name, pattern, score: specificity(filled.filled) });
    }
  }
  if (matches.length === 0) return undefined;
  const best = matches.reduce((top, match) => (match.score > top.score ? match : top));
  const tied = matches.filter((match) => match.part !== best.part && match.score === best.score);
  if (tied.length > 0) {
    const names = [best, ...tied].map((match) => `${match.part} ('${match.pattern}')`).join(' and ');
    resolution.errors.add(
      `${file}: ${archetype.name}'s files parts ${names} are equally specific; narrow one of the patterns`,
    );
  }
  return best.part;
};

export const specificity = (pattern: string): number => {
  if (!pattern.includes('*')) return Number.POSITIVE_INFINITY;
  if (pattern === '**') return -1;
  return pattern.length - pattern.lastIndexOf('*') - 1;
};

const globCache = new Map<string, RegExp>();

export const globRegex = (pattern: string): RegExp => {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  let source = '';
  for (let at = 0; at < pattern.length; at += 1) {
    if (pattern.startsWith('**/', at)) {
      source += '(?:.*/)?';
      at += 2;
    } else if (pattern.startsWith('**', at)) {
      source += '.*';
      at += 1;
    } else if (pattern[at] === '*') source += '[^/]*';
    else source += pattern[at]!.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  const regex = new RegExp(`^${source}$`);
  globCache.set(pattern, regex);
  return regex;
};
