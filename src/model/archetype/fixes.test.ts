import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { all, archetype, contains, dir, exposes, files, using } from './builder.ts';
import { fixSteps, sentence } from '../../builtins/advice.ts';
import { loadConfigData } from '../../app/load.ts';
import { fixesFor, sitesOf } from './fixes.ts';
import { type Folders, resolveModel } from './resolve.ts';

const folders = (paths: readonly string[]): Folders => {
  const dirs = new Set(
    paths.flatMap((path) =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, at, segments) => segments.slice(0, at + 1).join('/')),
    ),
  );
  const inside = (folder: string) => (path: string) =>
    path.startsWith(folder === '' ? '' : `${folder}/`) && !path.slice(folder.length && folder.length + 1).includes('/');
  return {
    folders: (folder) =>
      [...dirs]
        .filter(inside(folder))
        .map((path) => path.slice(path.lastIndexOf('/') + 1))
        .sort(),
    exists: (path) => paths.includes(path) || dirs.has(path),
  };
};

const paths = [
  'src/main.ts',
  'src/help/a.ts',
  'src/help/b.ts',
  'src/domain/order.ts',
  'src/domain/price.ts',
  'src/ui/shared.ts',
  'src/ui/a/a.dom.ts',
  'src/ui/a/a.ts',
  'src/ui/a/a.page.ts',
  'src/ui/a/c/c.dom.ts',
  'src/ui/a/c/c.ts',
  'src/ui/b/b.dom.ts',
  'src/ui/b/b.ts',
  'src/ui/b/b.page.ts',
  'src/log/log.ts',
  'src/log/log.test.ts',
  'e2e/flow.test.ts',
];

const setup = () => {
  const card = archetype('card')
    .identify({ marker: '{name}.dom.ts' })
    .requires({ log: dir() })
    .contains((c, { self, required }) =>
      c
        .module('sub', dir('{name}'), self)
        .module('logic', files('*.ts'), exposes(all()).using([required.log]))
        .module(
          'dom',
          files('{name}.dom.ts'),
          exposes(all()).using((m) => [m.logic, m.sub.render]),
        )
        .testModule('pages', files('*.page.ts')),
    )
    .exposes((m) => ({ render: m.dom }));

  const ui = archetype('ui')
    .contains((c) => c.module('cards', dir('{name}'), card).module('shared', files('shared.ts'), exposes(all())))
    .exposes(all());

  const app = archetype('app')
    .contains((c) =>
      c
        .module('helpers', files('src/help/*.ts'), exposes(files('src/help/a.ts')))
        .module('domain', dir('src/domain'), exposes(files('order.ts')))
        .module(
          'ui',
          dir('src/ui'),
          ui.using((m) => [m.domain, m.helpers]),
        )
        .module(
          'main',
          files('src/main.ts'),
          using((m) => [m.ui]),
        )
        .module('log', dir('src/log'), contains((d) => d.testModule('tests', files('*.test.ts'))).exposes(all()))
        .testModule('e2e', dir('e2e')),
    )
    .provides((m) => ({ log: m.log }));

  const { config } = loadConfigData({ root: app });
  return { config, model: resolveModel(config, folders(paths), paths) };
};

const advice = (from: string, to: string): string => {
  const { config, model } = setup();
  const fixes = fixesFor(config, model, from, to);
  return fixes === undefined ? 'no declared path' : sentence(fixSteps(model, fixes));
};

describe('fixes for an import outside reach', () => {
  it('names the first using, nearest first, whose module can name the target', () => {
    assert.equal(advice('src/main.ts', 'src/domain/order.ts'), 'add m.domain to the using of app.main');
  });

  it('opens the module that keeps the file private, then names the using to extend', () => {
    assert.equal(
      advice('src/main.ts', 'src/domain/price.ts'),
      "add 'price.ts' to what app.domain exposes and add m.domain to the using of app.main",
    );
    assert.equal(
      advice('src/main.ts', 'src/help/b.ts'),
      "add 'src/help/b.ts' to what app.helpers exposes and add m.helpers to the using of app.main",
    );
  });

  it('opens a surface on the archetype, and names every module that shares it', () => {
    assert.equal(advice('src/main.ts', 'src/ui/a/a.ts'), 'expose m.logic from card (all 3 card modules)');
    assert.equal(advice('src/main.ts', 'src/ui/a/c/c.ts'), 'expose m.logic and m.sub from card (all 3 card modules)');
  });

  it('declares the target above the importer when nothing it uses is in between', () => {
    assert.equal(
      advice('src/ui/a/a.dom.ts', 'src/ui/shared.ts'),
      'declare shared above cards in ui and add m.shared to the using of ui.cards',
    );
  });

  it('requires what sits above the importer and has an ancestor provide it', () => {
    assert.equal(
      advice('src/ui/a/c/c.dom.ts', 'src/ui/shared.ts'),
      'require shared in card, have ui provide m.shared as shared and add required.shared to the using of card.dom',
    );
  });

  it('offers no fix that would make the two modules use each other', () => {
    assert.equal(advice('src/log/log.ts', 'src/ui/shared.ts'), 'no declared path');
    assert.equal(advice('src/log/log.test.ts', 'src/ui/shared.ts'), 'add m.ui to the testUsing of app');
  });

  it('names a test module in a surface for test code that passes up through modules', () => {
    assert.equal(advice('e2e/flow.test.ts', 'src/ui/a/a.page.ts'), 'expose m.pages from card (all 3 card modules)');
  });

  it('finds no path between modules declared from one folder pattern, or to a module declared below', () => {
    assert.equal(advice('src/ui/a/a.ts', 'src/ui/b/b.ts'), 'no declared path');
    assert.equal(advice('src/ui/a/a.page.ts', 'src/ui/b/b.page.ts'), 'no declared path');
    assert.equal(advice('src/domain/order.ts', 'src/main.ts'), 'no declared path');
  });

  it('lists the usings that grant a file its reach, nearest first', () => {
    const { config, model } = setup();
    const labels = (file: string) => sitesOf(config, model, file).map((site) => site.label);
    assert.deepEqual(labels('src/ui/a/a.ts'), ['the using of card.logic', 'the using of ui.cards']);
    assert.deepEqual(labels('src/ui/a/a.page.ts'), [
      'the using of card.pages',
      'the testUsing of card',
      'the testUsing of ui',
      'the testUsing of app',
    ]);
    assert.deepEqual(labels('e2e/flow.test.ts'), ['the using of app.e2e', 'the testUsing of app']);
    assert.deepEqual(labels('src/ui/notes.md'), []);
  });

  it('adds a reference to the one using a site names', () => {
    const { config, model } = setup();
    const ref = { kind: 'package', pattern: 'x' } as const;
    const [logic] = sitesOf(config, model, 'src/ui/a/a.ts');
    const declared = logic!.add(config, ref);
    assert.deepEqual(
      declared.archetypes.card!.modules.map((module) => module.using.at(-1)),
      [undefined, ref, { kind: 'module', module: 'sub', surface: 'render' }, undefined],
    );
    assert.equal(declared.archetypes.ui, config.archetypes.ui);
    const [, card] = sitesOf(config, model, 'src/ui/a/a.page.ts');
    assert.deepEqual(card!.add(config, ref).archetypes.card!.testUsing, [ref]);
    const kit = {
      ...config,
      archetypes: { ...config.archetypes, card: { ...config.archetypes.card!, testUsing: [ref] } },
    };
    assert.deepEqual(card!.add(kit, ref).archetypes.card!.testUsing, [ref, ref]);
  });
});
