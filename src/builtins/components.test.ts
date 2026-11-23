import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { components } from './components.ts';

describe('components', () => {
  const member = (name: string, kind: 'function' | 'type') => ({ name, kind, line: 1, endLine: 1 });

  it('joins functions through a shared type and drops groups without a counted member', () => {
    const graph = {
      members: [
        member('a', 'function'),
        member('T', 'type'),
        member('b', 'function'),
        member('c', 'function'),
        member('Unused', 'type'),
      ],
      links: [
        [0, 1],
        [2, 1],
      ] as [number, number][],
    };
    assert.deepEqual(
      components(graph, ['function']).map((group) => group.map((u) => u.name)),
      [['a', 'T', 'b'], ['c']],
    );
  });
});
