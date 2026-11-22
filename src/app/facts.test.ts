import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ImportEdge, ModuleFacts } from '../model/facts.ts';
import { factsStore, freshFacts } from './facts.ts';
import type { Cache, CachedFacts, CachedFile } from './ports.ts';

const facts = (file: string, imports: Partial<ImportEdge>[] = []): ModuleFacts => ({
  file,
  lines: 1,
  imports: imports.map((edge) => ({ from: file, to: '', specifier: '', names: [], typeOnly: false, line: 1, ...edge })),
  externals: [],
  units: { units: [], links: [] },
  functions: [],
});

const module = (file: string, specifiers: string[], imports: Partial<ImportEdge>[] = []): [string, CachedFile] => [
  file,
  { hash: 'v1', specifiers, facts: facts(file, imports) },
];

const cached: CachedFacts = {
  digest: 'config',
  files: Object.fromEntries([
    module('src/core.ts', []),
    module('src/lib/index.ts', ['../core.ts'], [{ to: 'src/core.ts' }]),
    module('src/feature.ts', ['./lib'], [{ to: 'src/core.ts', via: 'src/lib/index.ts' }]),
    module('src/app.ts', ['./feature.ts', './missing.ts'], [{ to: 'src/feature.ts' }]),
    module('src/leaf.ts', ['../src/util.mjs']),
    module('src/lib/dot.ts', ['.']),
    module('src/lib/up.ts', ['..']),
    module('src/slash.ts', ['./lib/']),
    ['src/globals.d.ts', { hash: 'v1' }],
  ]),
};

const unchanged = Object.keys(cached.files).map((file) => [file, 'v1'] as const);
const modules = Object.keys(cached.files).filter((file) => cached.files[file]!.facts);

const stale = (changes: Record<string, string | null> = {}, digest = 'config') => {
  const hashes = new Map<string, string>(unchanged);
  for (const [file, hash] of Object.entries(changes)) {
    if (hash === null) hashes.delete(file);
    else hashes.set(file, hash);
  }
  const fresh = freshFacts(cached, { digest, hashes });
  return modules.filter((file) => !fresh.has(file)).sort();
};

describe('freshFacts', () => {
  it('keeps every module when no file changed', () => assert.deepEqual(stale(), []));

  it('drops a changed file and every file that imports it, directly or through others', () => {
    assert.deepEqual(stale({ 'src/core.ts': 'v2' }), [
      'src/app.ts',
      'src/core.ts',
      'src/feature.ts',
      'src/lib/index.ts',
    ]);
    assert.deepEqual(stale({ 'src/feature.ts': 'v2' }), ['src/app.ts', 'src/feature.ts']);
  });

  it('drops the importers a barrel passes a name through, by the barrel it came via', () => {
    assert.deepEqual(stale({ 'src/lib/index.ts': 'v2' }), ['src/app.ts', 'src/feature.ts', 'src/lib/index.ts']);
  });

  it('drops a deleted file and its importers', () => {
    assert.deepEqual(stale({ 'src/feature.ts': null }), ['src/app.ts', 'src/feature.ts']);
  });

  it('drops a file whose specifier may now resolve to an added file', () => {
    assert.deepEqual(stale({ 'src/missing.ts': 'v1' }), ['src/app.ts']);
    assert.deepEqual(stale({ 'src/util.mts': 'v1' }), ['src/leaf.ts']);
  });

  it('matches a directory specifier to an index file added inside it', () => {
    assert.deepEqual(stale({ 'src/missing/index.ts': 'v1' }), [
      'src/app.ts',
      'src/lib/dot.ts',
      'src/lib/up.ts',
      'src/slash.ts',
    ]);
    assert.deepEqual(stale({ 'index.ts': 'v1' }), ['src/lib/dot.ts', 'src/lib/up.ts', 'src/slash.ts']);
  });

  it('keeps every module when an added file matches no specifier', () => {
    assert.deepEqual(stale({ 'src/lib/other.ts': 'v1', 'src/util.test.ts': 'v1' }), []);
  });

  it('drops everything when a declaration file or the config digest changes', () => {
    assert.deepEqual(stale({ 'src/globals.d.ts': 'v2' }), modules.sort());
    assert.deepEqual(stale({}, 'other config'), modules.sort());
  });

  it('starts empty without a cache', () => {
    assert.deepEqual([...freshFacts(undefined, { digest: 'config', hashes: new Map(unchanged) })], []);
  });
});

describe('factsStore', () => {
  it('keeps one entry per tool digest and project, pruning entries from other tool digests', () => {
    const entries = new Map<string, CachedFacts>([['old-facts-app', cached]]);
    const cache: Cache<CachedFacts> = {
      get: (key) => entries.get(key),
      set: (key, value) => entries.set(key, value),
      prune: (keep) => {
        for (const key of entries.keys()) if (!keep(key)) entries.delete(key);
      },
    };
    const store = factsStore(cache, 'tool', 'packages/app');
    assert.equal(store.read(), undefined);
    store.write(cached);
    assert.deepEqual([...entries.keys()], ['tool-facts-packages_app']);
    assert.equal(store.read(), cached);
  });
});
