import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { Cache, CachedFacts } from '../../app/ports.ts';
import { factsStore } from './factsStore.ts';

const cached: CachedFacts = { digest: 'config', files: {} };

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
