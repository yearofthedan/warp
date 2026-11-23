import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { anchorAtChange, diff } from './diff.ts';
import { type Finding } from './rule.ts';

describe('diff', () => {
  const finding = (key: string, value: number) => ({ key, value }) as Finding;

  it('separates new, worsened and resolved findings', () => {
    const delta = diff(
      [finding('kept', 2), finding('worse', 3), finding('gone', 1)],
      [finding('kept', 2), finding('worse', 4), finding('fresh', 1)],
    );
    assert.deepEqual(
      delta.added.map((f) => f.key),
      ['fresh'],
    );
    assert.deepEqual(
      delta.worsened.map((f) => [f.key, f.was]),
      [['worse', 3]],
    );
    assert.deepEqual(
      delta.resolved.map((f) => f.key),
      ['gone'],
    );
  });
});

describe('diff by parts', () => {
  const loop = (key: string, value: number, parts: string[]): Finding =>
    ({ rule: 'module-cycle', key, value, parts }) as Finding;

  it('matches a finding whose key changed to the base finding it shares a part with', () => {
    const two = loop('module-cycle:a+b', 2, ['a->b', 'b->a']);
    const three = loop('module-cycle:a+b+c', 4, ['a->b', 'b->c', 'c->a', 'b->a']);
    const grown = diff([two], [three]);
    assert.deepEqual(
      [grown.added, grown.worsened.map((f) => [f.key, f.was]), grown.resolved],
      [[], [['module-cycle:a+b+c', 2]], []],
    );
    const shrunk = diff([three], [two]);
    assert.deepEqual([shrunk.added, shrunk.worsened, shrunk.resolved], [[], [], []]);
  });

  it('matches parts within a rule only, and resolves a base finding nothing matched', () => {
    const other = { ...loop('no-cycle:x', 1, ['a->b']), rule: 'no-cycle' };
    const delta = diff([other, loop('module-cycle:c+d', 1, ['c->d'])], [loop('module-cycle:a+b', 1, ['a->b'])]);
    assert.deepEqual(
      [delta.added.map((f) => f.key), delta.resolved.map((f) => f.key)],
      [['module-cycle:a+b'], ['no-cycle:x', 'module-cycle:c+d']],
    );
  });
});

describe('anchorAtChange', () => {
  const loop: Finding = {
    rule: 'module-cycle',
    key: 'module-cycle:domain+infra',
    file: 'infra/db.ts',
    line: 9,
    value: 2,
    message: 'loop',
    sites: [
      { file: 'infra/db.ts', line: 9 },
      { file: 'domain/order.ts', line: 1 },
      { file: 'domain/probe.ts', line: 3 },
    ],
  };
  const at = ({ key, file, line }: Finding) => [key, file, line];

  it('moves a new or worse finding to its first changed site, and leaves the rest', () => {
    const delta = anchorAtChange(
      {
        added: [loop, { ...loop, key: 'untouched', sites: [{ file: 'infra/db.ts', line: 9 }] }],
        worsened: [{ ...loop, key: 'worse', was: 1 }],
        resolved: [loop],
      },
      () =>
        ({ file }) =>
          ['domain/probe.ts', 'domain/order.ts'].includes(file),
    );
    assert.deepEqual(delta.added.map(at), [
      ['module-cycle:domain+infra', 'domain/order.ts', 1],
      ['untouched', 'infra/db.ts', 9],
    ]);
    assert.deepEqual(
      delta.worsened.map((finding) => [...at(finding), finding.was]),
      [['worse', 'domain/order.ts', 1, 1]],
    );
    assert.deepEqual(delta.resolved.map(at), [['module-cycle:domain+infra', 'infra/db.ts', 9]]);
  });

  it('asks for the changed files only when a finding to act on has sites', () => {
    const asked: string[] = [];
    const touched = () => {
      asked.push('asked');
      return () => false;
    };
    const plain = { ...loop, sites: undefined };
    const delta = { added: [plain], worsened: [], resolved: [loop] };
    assert.equal(anchorAtChange(delta, touched), delta);
    assert.deepEqual(asked, []);
  });
});
