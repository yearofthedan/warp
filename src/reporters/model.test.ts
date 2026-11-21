import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { archetype } from '../model/archetype/builder.ts';
import { loadConfigData } from '../model/archetype/load.ts';
import { resolveModel } from '../model/archetype/resolve.ts';
import { modelJson, modelText } from './model.ts';

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .contains((p) => p.files('logic', '*.ts').files('dom', '{name}.dom.ts'));
const root = archetype('app').contains((p) =>
  p
    .dir('strings', 'src/strings')
    .dir('features', 'lib/{area}/{name}')
    .dir('components', 'src/{name}', component)
    .files('main', 'src/main.ts'),
);
const files = [
  'src/main.ts',
  'src/stray.ts',
  'src/card/card.dom.ts',
  'src/card/card.ts',
  'src/strings/en.ts',
  'lib/orders/list/list.ts',
];
const model = resolveModel(
  loadConfigData({ root }).config,
  {
    folders: (dir) =>
      ({ '': ['lib', 'src'], lib: ['orders'], 'lib/orders': ['list'], src: ['card', 'empty', 'strings'] })[dir] ?? [],
    exists: (path) => files.includes(path) || path === 'src/empty/empty.dom.ts',
  },
  files,
);

describe('modelText', () => {
  it('prints the unit tree with each unit part, archetype, captures and files, and the loose files', () => {
    assert.equal(
      modelText(model),
      [
        '.  root: app  main: 1',
        '  loose (deny): src/stray.ts',
        '  lib/orders/list  features: plain folder {area=orders} {name=list}  1 files',
        '  src/card  components: component {name=card}  logic: 1, dom: 1',
        '  src/empty  components: component {name=empty}  no files',
        '  src/strings  strings: plain folder  1 files',
        '',
        '5 units, 6 files, 1 loose.',
      ].join('\n'),
    );
  });
});

describe('modelJson', () => {
  it('lists every unit with its parent and children by id', () => {
    const { units } = JSON.parse(modelJson(model));
    assert.deepEqual(units[0], {
      id: '.',
      archetype: 'app',
      captures: {},
      children: ['lib/orders/list', 'src/card', 'src/empty', 'src/strings'],
      ownFiles: ['src/main.ts', 'src/stray.ts'],
      parts: { main: ['src/main.ts'] },
      loose: 'deny',
      looseFiles: ['src/stray.ts'],
    });
    assert.deepEqual(units[4], {
      id: 'src/strings',
      part: 'strings',
      captures: {},
      parent: '.',
      children: [],
      ownFiles: ['src/strings/en.ts'],
      parts: {},
      loose: 'allow',
      looseFiles: [],
    });
  });
});
