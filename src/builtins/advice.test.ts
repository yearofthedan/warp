import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { Fix } from '../domain/fixes/fixes.ts';
import type { Model, ModuleView } from '../domain/model/resolve.ts';
import { fixSteps, sentence } from './advice.ts';

const model = (archetypes: string[]): Model =>
  ({ modules: archetypes.map((archetype) => ({ archetype }) as ModuleView) }) as Model;

describe('advice', () => {
  it('joins steps into one sentence', () => {
    assert.equal(sentence([]), '');
    assert.equal(sentence(['a']), 'a');
    assert.equal(sentence(['a', 'b']), 'a and b');
    assert.equal(sentence(['a', 'b', 'c']), 'a, b and c');
  });

  it('merges exposes in a row on one archetype, and counts the modules that share it', () => {
    const fixes: Fix[] = [
      { kind: 'expose', archetype: 'card', ref: { kind: 'module', module: 'logic' } },
      { kind: 'expose', archetype: 'card', ref: { kind: 'module', module: 'sub' } },
      { kind: 'expose', archetype: 'panel', ref: { kind: 'module', module: 'body' } },
      { kind: 'using', site: 'root.main.dependencies', ref: { kind: 'required', name: 'log', surface: 'api' } },
      { kind: 'expose', archetype: 'card', ref: { kind: 'module', module: 'render' } },
      { kind: 'expose-file', archetype: 'root.domain', pattern: 'price.ts' },
      { kind: 'require', archetype: 'card', name: 'log', sites: ['ui.cards', 'card.sub'], module: 'log' },
    ];
    assert.deepEqual(fixSteps(model(['card', 'card', 'panel']), fixes), [
      'add logic and sub to card.exposes (all 2 card modules)',
      'add body to panel.exposes',
      'add log.api to root.main.dependencies',
      'add render to card.exposes (all 2 card modules)',
      "add 'price.ts' to the files of root.domain.exposes",
      'add log to card.requires, bound in the dependencies of ui.cards and card.sub',
    ]);
  });
});
