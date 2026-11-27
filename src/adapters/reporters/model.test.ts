import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { compileConfig } from '../../domain/language/compile.ts';
import { resolveModel } from '../../domain/model/resolve.ts';
import { rulesOf } from '../../domain/model/settings.ts';
import { modelJson, modelText } from './model.ts';

const paths = [
  'src/main.ts',
  'src/stray.ts',
  'src/card/card.dom.ts',
  'src/card/card.ts',
  'src/strings/en.ts',
  'lib/orders/list/list.ts',
];

const resolved = () => {
  const config = compileConfig(
    parse(`
root:
  ruleset: { rules: { no-cycle: on, max-lines: { max: 200 } } }
  modules:
    strings: { dir: src/strings }
    features: { dir: 'lib/orders/*' }
    components: { dir: 'src/*', archetype: component, ruleset: { rules: { max-lines: { max: 300 } } } }
    main: { files: src/main.ts }
archetypes:
  component:
    marker: '{name}.dom.ts'
    modules:
      logic: { files: '*.ts' }
      dom: { files: '{name}.dom.ts', ruleset: { rules: { no-cycle: off } } }
`),
  );
  const model = resolveModel(
    config,
    {
      folders: (dir) =>
        ({ '': ['lib', 'src'], lib: ['orders'], 'lib/orders': ['list'], src: ['card', 'empty', 'strings'] })[dir] ?? [],
      exists: (path) => paths.includes(path) || path === 'src/empty/empty.dom.ts',
    },
    paths,
  );
  return { config, model };
};

describe('modelText', () => {
  it('prints the module tree with each module, its archetype and captures, its files, and the loose files', () => {
    const { model } = resolved();
    assert.equal(
      modelText(model),
      [
        '(root)  root: root',
        '  loose: src/stray.ts',
        '  src/strings  strings: root.strings, 1 file',
        '  lib/orders/list  features: root.features {name=list}, 1 file',
        '  src/card  components: component {name=card}',
        '    src/card:logic  1 file',
        '    src/card:dom  1 file',
        '  src/empty  components: component {name=empty}',
        '  (root):main  1 file',
        '',
        '8 modules, 6 files, 1 loose.',
      ].join('\n'),
    );
  });
});

describe('modelText with rules', () => {
  it('lists what each module changes from the one above', () => {
    const { config, model } = resolved();
    const rules = rulesOf(config, model, [{ id: 'max-lines', defaults: { max: 100 } }, { id: 'no-cycle' }]);
    assert.equal(
      modelText(model, rules),
      [
        '(root)  root: root',
        '  rules: max-lines {"max":200}',
        '  loose: src/stray.ts',
        '  src/strings  strings: root.strings, 1 file',
        '  lib/orders/list  features: root.features {name=list}, 1 file',
        '  src/card  components: component {name=card}',
        '    rules: max-lines {"max":300}',
        '    src/card:logic  1 file',
        '    src/card:dom  1 file',
        '      rules: no-cycle off',
        '  src/empty  components: component {name=empty}',
        '    rules: max-lines {"max":300}',
        '  (root):main  1 file',
        '',
        '8 modules, 6 files, 1 loose.',
      ].join('\n'),
    );
  });
});

describe('modelJson', () => {
  it("gives each module's resolved rules when asked", () => {
    const { config, model } = resolved();
    const rules = rulesOf(config, model, [{ id: 'no-cycle' }]);
    const { modules } = JSON.parse(modelJson(model, rules));
    const rulesOfModule = (id: string) => modules.find((module: { id: string }) => module.id === id).rules;
    assert.deepEqual(rulesOfModule('src/card'), { 'no-cycle': {} });
    assert.deepEqual(rulesOfModule('src/card:dom'), { 'no-cycle': false });
  });

  it('lists every module with its kind, parent and children by id', () => {
    const { model } = resolved();
    const { modules } = JSON.parse(modelJson(model));
    assert.deepEqual(modules[0], {
      id: '(root)',
      kind: 'dir',
      archetype: 'root',
      captures: {},
      children: ['src/strings', 'lib/orders/list', 'src/card', 'src/empty', '(root):main'],
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
