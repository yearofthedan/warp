import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { diff } from './diff.ts';
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
