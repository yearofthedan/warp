import { ConfigError } from '../configError.ts';
import type { ArchetypeData, ConfigData, DirPartData } from './data.ts';

export interface Folders {
  folders(dir: string): string[];
  exists(path: string): boolean;
}

export interface ModuleView {
  id: string;
  dir: string;
  part?: string;
  archetype?: string;
  captures: Record<string, string>;
  parent?: ModuleView;
  children: ModuleView[];
  ownFiles: string[];
  parts: Record<string, string[]>;
  looseFiles: string[];
}

export interface Model {
  root: ModuleView;
  modules: ModuleView[];
  moduleOf(file: string): ModuleView | undefined;
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
  modules: ModuleView[];
  byDir: Map<string, ModuleView>;
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
  const resolution: Resolution = { config, folders, modules: [], byDir: new Map(), errors: new Set() };
  const root = build(resolution, { dir: '', archetype: config.archetypes[config.root], captures: {} });
  const moduleOf = new Map<string, ModuleView>();
  const partOf = new Map<string, string>();
  for (const file of [...files].sort()) {
    const module = deepest(resolution.byDir, file);
    moduleOf.set(file, module);
    module.ownFiles.push(file);
    const part = module.archetype === undefined ? undefined : filesPart(resolution, module, file);
    if (part !== undefined) {
      (module.parts[part] ??= []).push(file);
      partOf.set(file, part);
    } else if (module.archetype !== undefined) module.looseFiles.push(file);
  }
  if (resolution.errors.size > 0) throw new ConfigError([...resolution.errors].join('\n'));
  for (const module of resolution.modules)
    if (module.archetype !== undefined) module.parts = inDeclarationOrder(config, module);
  return {
    root,
    modules: resolution.modules,
    moduleOf: (file) => moduleOf.get(file),
    partOf: (file) => partOf.get(file),
  };
};

const inDeclarationOrder = (config: ConfigData, module: ModuleView): Record<string, string[]> =>
  Object.fromEntries(
    config.archetypes[module.archetype!]!.parts.flatMap((part) =>
      module.parts[part.name] ? [[part.name, module.parts[part.name]!]] : [],
    ),
  );

interface Found {
  dir: string;
  archetype?: ArchetypeData;
  captures: Record<string, string>;
  parent?: ModuleView;
  part?: string;
}

const build = (resolution: Resolution, { dir, archetype, captures, parent, part }: Found): ModuleView => {
  const module: ModuleView = {
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
  resolution.modules.push(module);
  resolution.byDir.set(dir, module);
  if (archetype === undefined) return module;
  for (const [childDir, claims] of [...claimsIn(resolution, module, archetype)].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const winner = mostSpecific(resolution, archetype, childDir, claims);
    const existing = resolution.byDir.get(childDir);
    if (existing) {
      resolution.errors.add(
        `${childDir}: found as a module of ${partPath(module, winner.part.name)} and of ${existing.part}; one folder is one module`,
      );
      continue;
    }
    module.children.push(
      build(resolution, {
        dir: childDir,
        archetype: winner.archetype,
        captures: winner.captures,
        parent: module,
        part: partPath(module, winner.part.name),
      }),
    );
  }
  return module;
};

const partPath = (module: ModuleView, part: string): string =>
  module.part === undefined ? part : `${module.part}.${part}`;

const claimsIn = (resolution: Resolution, module: ModuleView, archetype: ArchetypeData): Map<string, Claim[]> => {
  const claims = new Map<string, Claim[]>();
  for (const part of archetype.parts) {
    if (part.kind !== 'dir') continue;
    for (const claim of claimsOf(resolution, module, part))
      claims.set(claim.dir, [...(claims.get(claim.dir) ?? []), claim]);
  }
  return claims;
};

const claimsOf = (resolution: Resolution, module: ModuleView, part: DirPartData): Claim[] => {
  const child = part.archetype === undefined ? undefined : resolution.config.archetypes[part.archetype];
  return part.paths.flatMap((path) =>
    matchFolders(resolution.folders, module.dir, path).flatMap((match) => {
      const captures = identify(resolution, child, match.dir, match.captures, module);
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
  parent: ModuleView,
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

const chain = (module: ModuleView): ModuleView[] => (module.parent ? [...chain(module.parent), module] : [module]);

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

const deepest = (byDir: ReadonlyMap<string, ModuleView>, file: string): ModuleView => {
  for (let dir = parentDir(file); ; dir = parentDir(dir)) {
    const module = byDir.get(dir);
    if (module) return module;
  }
};

const filesPart = (resolution: Resolution, module: ModuleView, file: string): string | undefined => {
  const archetype = resolution.config.archetypes[module.archetype!]!;
  const path = module.dir === '' ? file : file.slice(module.dir.length + 1);
  const matches: { part: string; pattern: string; score: number }[] = [];
  for (const part of archetype.parts) {
    if (part.kind !== 'files') continue;
    for (const pattern of part.patterns) {
      const filled = fill(pattern, module.captures);
      if ('missing' in filled) {
        resolution.errors.add(
          `${module.id}: ${archetype.name}.${part.name} '${pattern}' names {${filled.missing}}, which ${module.id} doesn't capture`,
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
