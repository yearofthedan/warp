import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vite-plus/test';
import { gitRepository } from './repository.ts';

describe('changedLines', () => {
  it("lists the project's added lines since a commit, and every line of a file git does not track", () => {
    const repo = mkdtempSync(join(tmpdir(), 'warp-repository-'));
    const project = join(repo, 'app');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    mkdirSync(project);
    writeFileSync(join(repo, 'outside.ts'), 'a\n');
    writeFileSync(join(project, 'kept.ts'), 'a\nb\nc\nd\n');
    writeFileSync(join(project, 'cut.ts'), 'a\nb\n');
    git('init', '--quiet');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');
    writeFileSync(join(repo, 'outside.ts'), 'changed\n');
    writeFileSync(join(project, 'kept.ts'), 'a\nB\nnew\nc\nd\ne\n');
    writeFileSync(join(project, 'cut.ts'), 'a\n');
    writeFileSync(join(project, 'fresh.ts'), 'x\n');

    assert.deepEqual(gitRepository(project).changedLines('HEAD'), [
      { file: 'kept.ts', from: 2, to: 3 },
      { file: 'kept.ts', from: 6, to: 6 },
      { file: 'fresh.ts', from: 1, to: Number.POSITIVE_INFINITY },
    ]);
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'head');
    assert.deepEqual(gitRepository(project).changedLines('HEAD~1', 'HEAD'), [
      { file: 'fresh.ts', from: 1, to: 1 },
      { file: 'kept.ts', from: 2, to: 3 },
      { file: 'kept.ts', from: 6, to: 6 },
    ]);
  });
});
