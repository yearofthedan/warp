import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { Fix } from '../model/archetype/fixes.ts';
import type { Model, ModuleView } from '../model/archetype/resolve.ts';
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
      { kind: 'declare', archetype: 'app', module: 'ui', above: 'main' },
      { kind: 'using', site: 'the using of app.main', ref: { kind: 'required', name: 'log', surface: 'api' } },
      { kind: 'expose', archetype: 'card', ref: { kind: 'module', module: 'dom' } },
      { kind: 'expose-file', archetype: 'app.domain', pattern: 'price.ts' },
      { kind: 'require', archetype: 'card', name: 'log', provider: 'app', module: 'log' },
    ];
    assert.deepEqual(fixSteps(model(['card', 'card', 'panel']), fixes), [
      'expose m.logic and m.sub from card (all 2 card modules)',
      'expose m.body from panel',
      'declare ui above main in app',
      'add required.log.api to the using of app.main',
      'expose m.dom from card (all 2 card modules)',
      "add 'price.ts' to what app.domain exposes",
      'require log in card, have app provide m.log as log',
    ]);
  });
});
