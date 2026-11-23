import { ConfigError } from '../configError.ts';
import type { ArchetypeData, ConfigData, DirModuleData, ModuleData } from './data.ts';

export interface Folders {
  folders(dir: string): string[];
  exists(path: string): boolean;
}

export interface ModuleView {
  id: string;
  name?: string;
  kind: 'dir' | 'files';
  dir: string;
  archetype?: string;
  captures: Record<string, string>;
  parent?: ModuleView;
  children: ModuleView[];
  files: string[];
  looseFiles: string[];
}

export interface Model {
  root: ModuleView;
  modules: ModuleView[];
  moduleOf(file: string): ModuleView | undefined;
}

export const declarationOf = (config: ConfigData, module: ModuleView): ModuleData | undefined =>
  module.parent && config.archetypes[module.parent.archetype!]!.modules.find((data) => data.name === module.name);

interface Claim {
  module: DirModuleData;
  path: string;
  archetype: ArchetypeData;
  dir: string;
  captures: Record<string, string>;
  rank: number[];
}

interface Resolution {
  config: ConfigData;
  folders: Folders;
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

export const fillPattern = (pattern: string, captures: Record<string, string>): string | undefined => {
  const filled = fill(pattern, captures);
  return 'filled' in filled ? filled.filled : undefined;
};

export const resolveModel = (config: ConfigData, folders: Folders, files: readonly string[]): Model => {
  const resolution: Resolution = { config, folders, byDir: new Map(), errors: new Set() };
  const root = build(resolution, { dir: '', archetype: config.archetypes[config.root]!, captures: {} });
  const moduleOf = new Map<string, ModuleView>();
  for (const file of [...files].sort()) {
    const folder = deepest(resolution.byDir, file);
    const module = place(resolution, folder, file);
    moduleOf.set(file, module);
    module.files.push(file);
  }
  if (resolution.errors.size > 0) throw new ConfigError([...resolution.errors].join('\n'));
  order(config, root);
  return { root, modules: [...walk(root)], moduleOf: (file) => moduleOf.get(file) };
};

const walk = function* (module: ModuleView): Generator<ModuleView> {
  yield module;
  for (const child of module.children) yield* walk(child);
};

const order = (config: ConfigData, module: ModuleView) => {
  if (module.archetype === undefined) return;
  const declared = config.archetypes[module.archetype]!.modules.map((data) => data.name);
  module.children.sort((a, b) => declared.indexOf(a.name!) - declared.indexOf(b.name!) || a.dir.localeCompare(b.dir));
  for (const child of module.children) order(config, child);
};

const place = (resolution: Resolution, folder: ModuleView, file: string): ModuleView => {
  const archetype = resolution.config.archetypes[folder.archetype!]!;
  if (archetype.modules.length === 0) return folder;
  const name = filesModule(resolution, folder, archetype, file);
  if (name === undefined) {
    folder.looseFiles.push(file);
    return folder;
  }
  const id = `${folder.id}:${name}`;
  let module = folder.children.find((child) => child.id === id);
  if (!module) {
    module = {
      id,
      name,
      kind: 'files',
      dir: folder.dir,
      captures: folder.captures,
      parent: folder,
      children: [],
      files: [],
      looseFiles: [],
    };
    folder.children.push(module);
  }
  return module;
};

interface Found {
  dir: string;
  archetype: ArchetypeData;
  captures: Record<string, string>;
  parent?: ModuleView;
  name?: string;
}

const pathOf = (module: ModuleView): string =>
  module.parent?.name === undefined ? module.name! : `${pathOf(module.parent)}.${module.name}`;

const build = (resolution: Resolution, { dir, archetype, captures, parent, name }: Found): ModuleView => {
  const module: ModuleView = {
    id: dir === '' ? '.' : dir,
    ...(name === undefined ? {} : { name }),
    kind: 'dir',
    dir,
    archetype: archetype.name,
    captures,
    ...(parent === undefined ? {} : { parent }),
    children: [],
    files: [],
    looseFiles: [],
  };
  resolution.byDir.set(dir, module);
  for (const [childDir, claims] of [...claimsIn(resolution, module, archetype)].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const winner = mostSpecific(resolution, archetype, childDir, claims);
    const existing = resolution.byDir.get(childDir);
    if (existing) {
      const found = module.name === undefined ? winner.module.name : `${pathOf(module)}.${winner.module.name}`;
      resolution.errors.add(
        `${childDir}: found as a module of ${found} and of ${pathOf(existing)}; one folder is one module`,
      );
      continue;
    }
    module.children.push(
      build(resolution, {
        dir: childDir,
        archetype: winner.archetype,
        captures: winner.captures,
        parent: module,
        name: winner.module.name,
      }),
    );
  }
  return module;
};

const claimsIn = (resolution: Resolution, module: ModuleView, archetype: ArchetypeData): Map<string, Claim[]> => {
  const claims = new Map<string, Claim[]>();
  for (const declared of archetype.modules) {
    if (declared.kind !== 'dir') continue;
    for (const claim of claimsOf(resolution, module, declared))
      claims.set(claim.dir, [...(claims.get(claim.dir) ?? []), claim]);
  }
  return claims;
};

const claimsOf = (resolution: Resolution, module: ModuleView, declared: DirModuleData): Claim[] => {
  const child = resolution.config.archetypes[declared.archetype]!;
  return declared.paths.flatMap((path) =>
    matchFolders(resolution.folders, module.dir, path).flatMap((match) => {
      const captures = identify(resolution, child, match.dir, match.captures, module);
      return captures ? [{ module: declared, path, archetype: child, ...match, captures }] : [];
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
  archetype: ArchetypeData,
  dir: string,
  captures: Record<string, string>,
  parent: ModuleView,
): Record<string, string> | undefined => {
  const how = archetype.identify;
  if (how === undefined) return captures;
  if ('match' in how) {
    const matched = how.match(dir, chain(parent));
    return matched === false ? undefined : { ...captures, ...matched };
  }
  const marker = fill(how.marker, captures);
  if ('missing' in marker) {
    resolution.errors.add(
      `${dir}: ${archetype.name}'s marker '${how.marker}' names {${marker.missing}}, which its dir path doesn't capture`,
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
  const tied = claims.filter((claim) => claim.module !== best.module && compareRanks(claim.rank, best.rank) === 0);
  if (tied.length > 0) {
    const names = [best, ...tied].map((claim) => `${claim.module.name} ('${claim.path}')`).join(' and ');
    resolution.errors.add(
      `${dir}: ${archetype.name}'s dir modules ${names} are equally specific; narrow one of the paths`,
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

const filesModule = (
  resolution: Resolution,
  module: ModuleView,
  archetype: ArchetypeData,
  file: string,
): string | undefined => {
  const path = module.dir === '' ? file : file.slice(module.dir.length + 1);
  const matches: { module: string; pattern: string; score: number }[] = [];
  for (const declared of archetype.modules) {
    if (declared.kind !== 'files') continue;
    for (const pattern of declared.patterns) {
      const filled = fill(pattern, module.captures);
      if ('missing' in filled) {
        resolution.errors.add(
          `${module.id}: ${archetype.name}.${declared.name} '${pattern}' names {${filled.missing}}, which ${module.id} doesn't capture`,
        );
      } else if (globRegex(filled.filled).test(path))
        matches.push({ module: declared.name, pattern, score: specificity(filled.filled) });
    }
  }
  if (matches.length === 0) return undefined;
  const best = matches.reduce((top, match) => (match.score > top.score ? match : top));
  const tied = matches.filter((match) => match.module !== best.module && match.score === best.score);
  if (tied.length > 0) {
    const names = [best, ...tied].map((match) => `${match.module} ('${match.pattern}')`).join(' and ');
    resolution.errors.add(
      `${file}: ${archetype.name}'s files modules ${names} are equally specific; narrow one of the patterns`,
    );
  }
  return best.module;
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
