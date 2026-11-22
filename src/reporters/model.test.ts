import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { archetype, ruleset } from '../model/archetype/builder.ts';
import { loadConfigData } from '../app/load.ts';
import { resolveModel } from '../model/archetype/resolve.ts';
import { rulesOf } from '../model/archetype/settings.ts';
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
const rules = ruleset()
  .rules({ 'max-lines': { max: 200 } })
  .on(root.components, { 'max-lines': { max: 300 } })
  .on(component.dom, { 'no-cycle': false });
const { config } = loadConfigData({ root, rulesets: { default: rules } });
const model = resolveModel(
  config,
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
        '  loose: src/stray.ts',
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

describe('modelText with rules', () => {
  it('lists what each unit changes from the one above, and each part from its unit', () => {
    const rules = rulesOf(config, model, [{ id: 'max-lines', defaults: { max: 100 } }, { id: 'no-cycle' }]);
    assert.equal(
      modelText(model, rules),
      [
        '.  root: app  main: 1',
        '  rules in unit: max-lines {"max":200}',
        '  loose: src/stray.ts',
        '  lib/orders/list  features: plain folder {area=orders} {name=list}  1 files',
        '  src/card  components: component {name=card}  logic: 1, dom: 1',
        '    rules in unit: max-lines {"max":300}',
        '    rules in dom: no-cycle off',
        '  src/empty  components: component {name=empty}  no files',
        '    rules in unit: max-lines {"max":300}',
        '  src/strings  strings: plain folder  1 files',
        '',
        '5 units, 6 files, 1 loose.',
      ].join('\n'),
    );
  });
});

describe('modelJson', () => {
  it("gives each unit's and part's resolved rules when asked", () => {
    const rules = rulesOf(config, model, [{ id: 'no-cycle' }]);
    const card = JSON.parse(modelJson(model, rules)).units.find((unit: { id: string }) => unit.id === 'src/card');
    assert.deepEqual(card.rules, {
      unit: { 'no-cycle': {} },
      parts: { logic: { 'no-cycle': {} }, dom: { 'no-cycle': false } },
    });
  });

  it('lists every unit with its parent and children by id', () => {
    const { units } = JSON.parse(modelJson(model));
    assert.deepEqual(units[0], {
      id: '.',
      archetype: 'app',
      captures: {},
      children: ['lib/orders/list', 'src/card', 'src/empty', 'src/strings'],
      ownFiles: ['src/main.ts', 'src/stray.ts'],
      parts: { main: ['src/main.ts'] },
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
      looseFiles: [],
    });
  });
});
