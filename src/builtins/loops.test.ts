import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { listed, named } from './loops.ts';

describe('loop prose', () => {
  it('names the members of a loop', () => {
    assert.equal(named(['a', 'b']), 'a and b');
    assert.equal(named(['a', 'b', 'c']), 'a, b and c');
  });

  it('lists up to five imports, then counts the rest', () => {
    assert.equal(listed(['1', '2', '3', '4', '5']), '1, 2, 3, 4, 5');
    assert.equal(listed(['1', '2', '3', '4', '5', '6', '7']), '1, 2, 3, 4, 5, and 2 more');
  });
});
