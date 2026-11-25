import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
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

const yaml = `
root:
  modules:
    helpers: { files: 'src/help/*.ts', exposes: { files: src/help/a.ts } }
    domain: { dir: src/domain, exposes: { files: order.ts } }
    ui: { dir: src/ui, archetype: ui, dependencies: [log] }
    main: { files: src/main.ts, dependencies: [ui] }
    log:
      dir: src/log
      exposes: all
      test: { modules: { tests: { files: '*.test.ts' } } }
  test:
    modules:
      e2e: { dir: e2e }
archetypes:
  card:
    marker: '{name}.dom.ts'
    requires: [log]
    exposes: [render]
    modules:
      sub: { dir: '*', archetype: card, dependencies: [log] }
      logic: { files: '*.ts', dependencies: [log], exposes: all }
      render: { files: '{name}.dom.ts', dependencies: [logic, sub.render], exposes: all }
    test:
      modules:
        pages: { files: '*.page.ts' }
  ui:
    requires: [log]
    exposes: all
    modules:
      cards: { dir: '*', archetype: card, dependencies: [log] }
      shared: { files: shared.ts, exposes: all }
`;

const setup = () => {
  const { config } = loadConfigData(parse(yaml));
  return { config, model: resolveModel(config, folders(paths), paths) };
};

const advice = (from: string, to: string): string => {
  const { config, model } = setup();
  const fixes = fixesFor(config, model, from, to);
  return fixes === undefined ? 'no declared path' : sentence(fixSteps(model, fixes));
};

describe('fixes for an import outside reach', () => {
  it('names the dependencies, nearest first, whose module can name the target', () => {
    assert.equal(advice('src/main.ts', 'src/domain/order.ts'), 'add domain to root.main.dependencies');
  });

  it('opens the module that keeps the file private, then names the dependencies to extend', () => {
    assert.equal(
      advice('src/main.ts', 'src/domain/price.ts'),
      "add 'price.ts' to root.domain.exposes files and add domain to root.main.dependencies",
    );
    assert.equal(
      advice('src/main.ts', 'src/help/b.ts'),
      "add 'src/help/b.ts' to root.helpers.exposes files and add helpers to root.main.dependencies",
    );
  });

  it('opens a surface on the archetype, and names every module that shares it', () => {
    assert.equal(advice('src/main.ts', 'src/ui/a/a.ts'), 'add logic to card.exposes (all 3 card modules)');
    assert.equal(advice('src/main.ts', 'src/ui/a/c/c.ts'), 'add logic and sub to card.exposes (all 3 card modules)');
  });

  it("requires what sits beside the archetype's modules, bound where each one is used", () => {
    const required =
      'add shared to card.requires, bound in the dependencies of ui.cards and card.sub and add shared to card.render.dependencies';
    assert.equal(advice('src/ui/a/a.dom.ts', 'src/ui/shared.ts'), required);
    assert.equal(advice('src/ui/a/c/c.dom.ts', 'src/ui/shared.ts'), required);
  });

  it('names a module beside a holder inside the same archetype', () => {
    assert.equal(advice('src/log/log.test.ts', 'src/ui/shared.ts'), 'add ui to root.log.tests.dependencies');
  });

  it('offers no fix that would make the two modules use each other', () => {
    assert.equal(advice('src/log/log.ts', 'src/ui/shared.ts'), 'no declared path');
  });

  it('passes test code up through each module above it in a test surface, never in exposes', () => {
    assert.equal(
      advice('e2e/flow.test.ts', 'src/ui/a/a.page.ts'),
      'add pages to card.test.exposes (all 3 card modules) and add cards to ui.test.exposes',
    );
  });

  it('finds no path between modules declared from one folder pattern, or from a module to one that uses it', () => {
    assert.equal(advice('src/ui/a/a.ts', 'src/ui/b/b.ts'), 'no declared path');
    assert.equal(advice('src/ui/a/a.page.ts', 'src/ui/b/b.page.ts'), 'no declared path');
    assert.equal(advice('src/ui/shared.ts', 'src/main.ts'), 'no declared path');
  });

  it('lists the dependencies that grant a file its reach, nearest first', () => {
    const { config, model } = setup();
    const labels = (file: string) => sitesOf(config, model, file).map((site) => site.label);
    assert.deepEqual(labels('src/ui/a/a.ts'), ['card.logic.dependencies']);
    assert.deepEqual(labels('src/ui/a/a.page.ts'), [
      'card.pages.dependencies',
      'card.test.provides',
      'ui.test.provides',
      'root.test.provides',
    ]);
    assert.deepEqual(labels('e2e/flow.test.ts'), ['root.e2e.dependencies', 'root.test.provides']);
    assert.deepEqual(labels('src/ui/notes.md'), []);
  });

  it('adds a reference to the one list a site names', () => {
    const { config, model } = setup();
    const ref = { kind: 'package', pattern: 'x' } as const;
    const [logic] = sitesOf(config, model, 'src/ui/a/a.ts');
    const declared = logic!.add(config, ref);
    assert.deepEqual(
      declared.archetypes.card!.modules.map((module) => module.using.at(-1)),
      [{ kind: 'required', name: 'log' }, ref, { kind: 'module', module: 'sub', surface: 'render' }, undefined],
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
