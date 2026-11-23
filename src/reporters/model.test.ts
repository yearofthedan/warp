import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { archetype, dir, files, ruleset } from '../model/archetype/builder.ts';
import { loadConfigData } from '../app/load.ts';
import { resolveModel } from '../model/archetype/resolve.ts';
import { rulesOf } from '../model/archetype/settings.ts';
import { modelJson, modelText } from './model.ts';

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .contains((m) => m.module('logic', files('*.ts')).module('dom', files('{name}.dom.ts')));
const root = archetype('app').contains((m) =>
  m
    .module('strings', dir('src/strings'))
    .module('features', dir('lib/{area}/{name}'))
    .module('components', dir('src/{name}'), component)
    .module('main', files('src/main.ts')),
);
const paths = [
  'src/main.ts',
  'src/stray.ts',
  'src/card/card.dom.ts',
  'src/card/card.ts',
  'src/strings/en.ts',
  'lib/orders/list/list.ts',
];
const rules = ruleset()
  .rules({ 'max-lines': { max: 200 } })
  .on(root.modules.components, { 'max-lines': { max: 300 } })
  .on(component.modules.dom, { 'no-cycle': false });
const { config } = loadConfigData({ root, rulesets: { default: rules } });
const model = resolveModel(
  config,
  {
    folders: (dir) =>
      ({ '': ['lib', 'src'], lib: ['orders'], 'lib/orders': ['list'], src: ['card', 'empty', 'strings'] })[dir] ?? [],
    exists: (path) => paths.includes(path) || path === 'src/empty/empty.dom.ts',
  },
  paths,
);

describe('modelText', () => {
  it('prints the module tree with each module, its archetype and captures, its files, and the loose files', () => {
    assert.equal(
      modelText(model),
      [
        '.  root: app',
        '  loose: src/stray.ts',
        '  src/strings  strings: app.strings, 1 file',
        '  lib/orders/list  features: app.features {area=orders} {name=list}, 1 file',
        '  src/card  components: component {name=card}',
        '    src/card:logic  1 file',
        '    src/card:dom  1 file',
        '  src/empty  components: component {name=empty}',
        '  .:main  1 file',
        '',
        '8 modules, 6 files, 1 loose.',
      ].join('\n'),
    );
  });
});

describe('modelText with rules', () => {
  it('lists what each module changes from the one above', () => {
    const rules = rulesOf(config, model, [{ id: 'max-lines', defaults: { max: 100 } }, { id: 'no-cycle' }]);
    assert.equal(
      modelText(model, rules),
      [
        '.  root: app',
        '  rules: max-lines {"max":200}',
        '  loose: src/stray.ts',
        '  src/strings  strings: app.strings, 1 file',
        '  lib/orders/list  features: app.features {area=orders} {name=list}, 1 file',
        '  src/card  components: component {name=card}',
        '    rules: max-lines {"max":300}',
        '    src/card:logic  1 file',
        '    src/card:dom  1 file',
        '      rules: no-cycle off',
        '  src/empty  components: component {name=empty}',
        '    rules: max-lines {"max":300}',
        '  .:main  1 file',
        '',
        '8 modules, 6 files, 1 loose.',
      ].join('\n'),
    );
  });
});

describe('modelJson', () => {
  it("gives each module's resolved rules when asked", () => {
    const rules = rulesOf(config, model, [{ id: 'no-cycle' }]);
    const { modules } = JSON.parse(modelJson(model, rules));
    const rulesOfModule = (id: string) => modules.find((module: { id: string }) => module.id === id).rules;
    assert.deepEqual(rulesOfModule('src/card'), { 'no-cycle': {} });
    assert.deepEqual(rulesOfModule('src/card:dom'), { 'no-cycle': false });
  });

  it('lists every module with its kind, parent and children by id', () => {
    const { modules } = JSON.parse(modelJson(model));
    assert.deepEqual(modules[0], {
      id: '.',
      kind: 'dir',
      archetype: 'app',
      captures: {},
      children: ['src/strings', 'lib/orders/list', 'src/card', 'src/empty', '.:main'],
      files: ['src/stray.ts'],
      looseFiles: ['src/stray.ts'],
    });
    assert.deepEqual(modules[5], {
      id: 'src/card:dom',
      name: 'dom',
      kind: 'files',
      captures: { name: 'card' },
      parent: 'src/card',
      children: [],
      files: ['src/card/card.dom.ts'],
      looseFiles: [],
    });
  });
});
