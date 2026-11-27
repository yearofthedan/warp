import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ImportEdge, FileFacts } from '../../domain/facts/facts.ts';
import type { CachedFacts, CachedFile } from '../../app/ports.ts';
import { freshFacts } from './freshFacts.ts';

const facts = (file: string, imports: Partial<ImportEdge>[] = []): FileFacts => ({
  path: file,
  lines: 1,
  imports: imports.map((edge) => ({ from: file, to: '', specifier: '', names: [], typeOnly: false, line: 1, ...edge })),
  externals: [],
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
  classes: [],
});

const cachedFile = (file: string, specifiers: string[], imports: Partial<ImportEdge>[] = []): [string, CachedFile] => [
  file,
  { hash: 'v1', specifiers, facts: facts(file, imports) },
];

const cached: CachedFacts = {
  digest: 'config',
  files: Object.fromEntries([
    cachedFile('src/core.ts', []),
    cachedFile('src/lib/index.ts', ['../core.ts'], [{ to: 'src/core.ts' }]),
    cachedFile('src/feature.ts', ['./lib'], [{ to: 'src/core.ts', via: 'src/lib/index.ts' }]),
    cachedFile('src/app.ts', ['./feature.ts', './missing.ts'], [{ to: 'src/feature.ts' }]),
    cachedFile('src/leaf.ts', ['../src/util.mjs']),
    cachedFile('src/lib/dot.ts', ['.']),
    cachedFile('src/lib/up.ts', ['..']),
    cachedFile('src/slash.ts', ['./lib/']),
    ['src/globals.d.ts', { hash: 'v1' }],
  ]),
};

const unchanged = Object.keys(cached.files).map((file) => [file, 'v1'] as const);
const analyzed = Object.keys(cached.files).filter((file) => cached.files[file]!.facts);

const stale = (changes: Record<string, string | null> = {}, digest = 'config') => {
  const hashes = new Map<string, string>(unchanged);
  for (const [file, hash] of Object.entries(changes)) {
    if (hash === null) hashes.delete(file);
    else hashes.set(file, hash);
  }
  const fresh = freshFacts(cached, { digest, hashes });
  return analyzed.filter((file) => !fresh.has(file)).sort();
};

describe('freshFacts', () => {
  it('keeps every file when no file changed', () => assert.deepEqual(stale(), []));

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

  it('keeps every file when an added file matches no specifier', () => {
    assert.deepEqual(stale({ 'src/lib/other.ts': 'v1', 'src/util.test.ts': 'v1' }), []);
  });

  it('drops everything when a declaration file or the config digest changes', () => {
    assert.deepEqual(stale({ 'src/globals.d.ts': 'v2' }), analyzed.sort());
    assert.deepEqual(stale({}, 'other config'), analyzed.sort());
  });

  it('starts empty without a cache', () => {
    assert.deepEqual([...freshFacts(undefined, { digest: 'config', hashes: new Map(unchanged) })], []);
  });
});
