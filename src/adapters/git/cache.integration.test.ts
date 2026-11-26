import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, it } from 'vite-plus/test';
import { gitDirCache, maxAgeMs } from './cache.ts';

describe('gitDirCache', () => {
  let repo: string;
  const entries = () => readdirSync(join(repo, '.git/warp-cache')).sort();

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'warp-cache-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repo });
  });

  it('prunes the entries it is told to drop, and those unread for longer than the age limit', () => {
    let now = Date.now();
    const cache = gitDirCache(repo, () => now);
    for (const key of ['a-old', 'a-used', 'a-new', 'b-other']) cache.set(key, []);
    now += maxAgeMs / 2;
    cache.get('a-used');
    now += maxAgeMs / 2 + 1;
    cache.set('a-new', []);
    cache.prune((key) => key.startsWith('a-'));
    assert.deepEqual(entries(), ['a-new.json', 'a-used.json']);
  });
});
