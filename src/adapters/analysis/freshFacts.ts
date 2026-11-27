import type { CachedFacts, CachedFile } from '../../app/ports.ts';

export interface CurrentFiles {
  digest: string;
  hashes: ReadonlyMap<string, string>;
}

export const freshFacts = (cached: CachedFacts | undefined, current: CurrentFiles): Map<string, CachedFile> => {
  if (!cached || cached.digest !== current.digest) return new Map();
  const before = new Map(Object.entries(cached.files));
  const changed = [...before.keys(), ...current.hashes.keys()].filter(
    (file) => before.get(file)?.hash !== current.hashes.get(file),
  );
  if (changed.some(isDeclarationFile)) return new Map();
  const stale = importersOf(new Set([...changed, ...reresolved(before, current.hashes)]), before);
  const fresh = new Map<string, CachedFile>();
  for (const [file, entry] of before)
    if (entry.facts && !stale.has(file) && current.hashes.has(file)) fresh.set(file, entry);
  return fresh;
};

const isDeclarationFile = (file: string): boolean => file.endsWith('.d.ts');

const reresolved = (before: ReadonlyMap<string, CachedFile>, hashes: ReadonlyMap<string, string>): string[] => {
  const moved = [...before.keys(), ...hashes.keys()].filter((file) => before.has(file) !== hashes.has(file));
  const names = new Set(moved.flatMap(namesOf));
  return [...before].flatMap(([file, { specifiers = [] }]) =>
    specifiers.some((specifier) => names.has(specifierName(specifier))) ? [file] : [],
  );
};

const namesOf = (file: string): string[] => {
  const [name, ...dirs] = file.split('/').reverse() as [string, ...string[]];
  const stem = name.replace(/\.[^.]*$/, '');
  return stem === 'index' && dirs[0] ? [stem, dirs[0]] : [stem];
};

const specifierName = (specifier: string): string => {
  const name = specifier.split('/').at(-1)!;
  return name === '' || name === '.' || name === '..' ? 'index' : name.replace(/\.[cm]?[jt]sx?$/, '');
};

const importersOf = (seeds: ReadonlySet<string>, before: ReadonlyMap<string, CachedFile>): Set<string> => {
  const importers = reverseImports(before);
  const stale = new Set(seeds);
  for (const file of stale) for (const importer of importers.get(file) ?? []) stale.add(importer);
  return stale;
};

const reverseImports = (before: ReadonlyMap<string, CachedFile>): Map<string, Set<string>> => {
  const importers = new Map<string, Set<string>>();
  const edges = [...before.values()].flatMap(({ facts }) => facts?.imports ?? []);
  for (const { from, to, via = to } of edges)
    for (const target of [to, via]) importers.set(target, (importers.get(target) ?? new Set()).add(from));
  return importers;
};
