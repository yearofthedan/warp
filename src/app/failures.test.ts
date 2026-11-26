import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { failures } from './failures.ts';
import type { Cache } from './ports.ts';

const memory = (entries = new Map<string, string>()): Cache<string> => ({
  get: (key) => entries.get(key),
  set: (key, value) => entries.set(key, value),
  prune: (keep) => {
    for (const key of entries.keys()) if (!keep(key)) entries.delete(key);
  },
});

describe('failures', () => {
  it('counts a problem as new until the same problem comes again', () => {
    const memo = failures(memory(), 'tool');
    assert.equal(memo.isNew('no warp.yaml'), true);
    assert.equal(memo.isNew('no warp.yaml'), false);
    assert.equal(memo.isNew('another problem'), true);
  });

  it('forgets the last problem after a run that worked, and leaves other entries', () => {
    const entries = new Map([['tool-facts-app', 'facts']]);
    const memo = failures(memory(entries), 'tool');
    memo.isNew('no warp.yaml');
    memo.forget();
    assert.deepEqual([...entries.keys()], ['tool-facts-app']);
    assert.equal(memo.isNew('no warp.yaml'), true);
  });

  it('counts every problem as new without a cache', () => {
    const memo = failures(undefined, 'tool');
    assert.equal(memo.isNew('no warp.yaml'), true);
    assert.equal(memo.isNew('no warp.yaml'), true);
  });
});
