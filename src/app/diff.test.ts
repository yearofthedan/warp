import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { diffProject, InvalidRange, parseRange } from '../app/diff.ts';
import type { Finding } from '../rules/rule.ts';
import type { ProjectCheck } from './check.ts';
import type { FindingsCache, Repository } from './ports.ts';

describe('parseRange', () => {
  it('reads a base alone, two dots and three dots', () => {
    assert.deepEqual(parseRange('HEAD'), { base: 'HEAD', fromMergeBase: false });
    assert.deepEqual(parseRange('main..feature'), { base: 'main', head: 'feature', fromMergeBase: false });
    assert.deepEqual(parseRange('main...feature'), { base: 'main', head: 'feature', fromMergeBase: true });
    assert.deepEqual(parseRange('main...'), { base: 'main', fromMergeBase: true });
  });

  it('keeps single dots inside a ref', () => {
    assert.deepEqual(parseRange('v1.2..v1.3'), { base: 'v1.2', head: 'v1.3', fromMergeBase: false });
  });

  it('refuses a range with more than one separator or no base', () => {
    assert.throws(() => parseRange('a..b..c'), InvalidRange);
    assert.throws(() => parseRange('..b'), InvalidRange);
  });
});

const finding = (key: string, value = 1): Finding => ({ rule: 'r', key, file: 'a.ts', line: 1, value, message: key });
const keys = (findings: Finding[]) => findings.map((f) => f.key);

describe('diffProject on the working tree', () => {
  const setup = (atCommit: Finding[]) => {
    const entries = new Map<string, Finding[]>();
    const cache: FindingsCache = {
      get: (key) => entries.get(key),
      set: (key, value) => void entries.set(key, value),
      prune: (keep) => {
        for (const key of entries.keys()) if (!keep(key)) entries.delete(key);
      },
    };
    let head = 'one';
    const repository: Repository = {
      projectPath: () => 'app',
      commit: (ref) => (ref === 'HEAD' ? `sha-${head}` : `sha-${ref}`),
      mergeBase: () => 'sha-merge-base',
      changedLines: () => [],
      checkout: () => ({ projectRoot: '/checkout', dispose: () => {} }),
    };
    let tree: Finding[] = [];
    const project: ProjectCheck = {
      config: {},
      requiredFile: 'tsconfig.json',
      check: (root) => (root === '/checkout' ? atCommit : tree),
    };
    const run = (findings: Finding[], root = '/work', toolDigest = 'tool', sinceLastRun = true) => {
      tree = findings;
      const range = parseRange('HEAD');
      return diffProject({ range, root, project, toolDigest, sinceLastRun }, { repository, cache });
    };
    const moveHead = (to: string) => {
      head = to;
    };
    return { run, entries, moveHead };
  };

  it('compares every run with the base, and keeps no last run, without the flag', () => {
    const { run, entries } = setup([finding('committed')]);
    assert.deepEqual(keys(run([finding('committed'), finding('new')], '/work', 'tool', false).added), ['new']);
    assert.deepEqual(keys(run([finding('committed'), finding('new')], '/work', 'tool', false).added), ['new']);
    assert.ok([...entries.keys()].every((key) => !key.includes('last-run')));
  });

  it('compares the first run with the base, and each later run with the one before', () => {
    const { run } = setup([finding('committed')]);
    assert.deepEqual(keys(run([finding('committed'), finding('first')]).added), ['first']);
    const second = run([finding('committed'), finding('first', 2), finding('second')]);
    assert.deepEqual([keys(second.added), keys(second.worsened)], [['second'], ['first']]);
    assert.deepEqual(keys(run([finding('committed')]).resolved), ['first', 'second']);
  });

  it('keeps a last run for each working tree', () => {
    const { run } = setup([]);
    run([finding('here')], '/work');
    assert.deepEqual(keys(run([finding('here')], '/other').added), ['here']);
    assert.deepEqual(keys(run([finding('here')], '/work').added), []);
  });

  it('starts again from the base when HEAD moves, and drops the last run from before', () => {
    const { run, entries, moveHead } = setup([finding('at head')]);
    run([finding('at head'), finding('before the move')]);
    moveHead('two');
    assert.deepEqual(keys(run([finding('at head'), finding('before the move')]).added), ['before the move']);
    assert.deepEqual(
      [...entries.keys()].filter((key) => key.includes('last-run')).map((key) => key.split('-').at(-1)),
      ['two'],
    );
  });

  it('starts again from the base under another build of warp', () => {
    const { run } = setup([]);
    run([finding('seen')], '/work', 'tool');
    assert.deepEqual(keys(run([finding('seen')], '/work', 'newer').added), ['seen']);
  });

  it('refuses a range with a head, since only the working tree has a last run', () => {
    const project: ProjectCheck = { config: {}, requiredFile: 'tsconfig.json', check: () => [] };
    const request = {
      range: parseRange('HEAD~1..HEAD'),
      root: '/work',
      project,
      toolDigest: 'tool',
      sinceLastRun: true,
    };
    const ports = { repository: {} as Repository, cache: {} as FindingsCache };
    assert.throws(() => diffProject(request, ports), InvalidRange);
  });
});

describe('diffProject anchoring', () => {
  const loop = (file: string): Finding => ({
    ...finding('loop'),
    file,
    sites: [
      { file: 'infra/db.ts', line: 9 },
      { file: 'domain/probe.ts', line: 1 },
    ],
  });
  const anchored = (range: string) => {
    const asked: [string, string | undefined][] = [];
    const repository: Repository = {
      projectPath: () => '',
      commit: (ref) => `sha-${ref}`,
      mergeBase: (a, b) => `base-of-${a}-${b}`,
      changedLines: (base, head) => {
        asked.push([base, head]);
        return [
          { file: 'infra/db.ts', from: 1, to: 8 },
          { file: 'domain/probe.ts', from: 1, to: 1 },
        ];
      },
      checkout: (commit) => ({ projectRoot: commit, dispose: () => {} }),
    };
    const cache: FindingsCache = { get: () => undefined, set: () => {}, prune: () => {} };
    const project: ProjectCheck = {
      config: {},
      requiredFile: 'tsconfig.json',
      check: (root) => (root === '/work' || root === 'sha-feature' ? [loop('infra/db.ts')] : []),
    };
    const delta = diffProject(
      { range: parseRange(range), root: '/work', project, toolDigest: 'tool' },
      { repository, cache },
    );
    return { at: delta.added.map(({ file, line }) => `${file}:${line}`), asked };
  };

  it('anchors a new finding at a site on a line changed since the base', () => {
    assert.deepEqual(anchored('HEAD'), { at: ['domain/probe.ts:1'], asked: [['HEAD', undefined]] });
    assert.deepEqual(anchored('main...'), { at: ['domain/probe.ts:1'], asked: [['base-of-main-HEAD', undefined]] });
    assert.deepEqual(anchored('main..feature'), { at: ['domain/probe.ts:1'], asked: [['main', 'feature']] });
  });
});
