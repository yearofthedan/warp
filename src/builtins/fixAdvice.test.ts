import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { fixSteps, sentence } from './advice.ts';
import { loadConfigData } from '../app/load.ts';
import { fixesFor, sitesOf } from '../domain/fixes/fixes.ts';
import { type Folders, resolveModel } from '../domain/model/resolve.ts';

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

const setup = (files = paths, text = yaml) => {
  const { config } = loadConfigData(parse(text));
  return { config, model: resolveModel(config, folders(files), files) };
};

const advice = (from: string, to: string, files = paths, text = yaml): string => {
  const { config, model } = setup(files, text);
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
      "add 'price.ts' to the files of root.domain.exposes and add domain to root.main.dependencies",
    );
    assert.equal(
      advice('src/main.ts', 'src/help/b.ts'),
      "add 'src/help/b.ts' to the files of root.helpers.exposes and add helpers to root.main.dependencies",
    );
  });

  it('opens a surface on the archetype, and names every module that shares it', () => {
    assert.equal(advice('src/main.ts', 'src/ui/a/a.ts'), 'add logic to card.exposes (all 3 card modules)');
    assert.equal(advice('src/main.ts', 'src/ui/a/c/c.ts'), 'add logic and sub to card.exposes (all 3 card modules)');
  });

  it("requires what sits beside the archetype's modules, bound where each one is used", () => {
    const required =
      'add shared to card.requires, bound in the dependencies of card.sub and ui.cards and add shared to card.render.dependencies';
    assert.equal(advice('src/ui/a/a.dom.ts', 'src/ui/shared.ts'), required);
    assert.equal(advice('src/ui/a/c/c.dom.ts', 'src/ui/shared.ts'), required);
  });

  it('binds a requires at every use of the archetype, one with no instance yet included', () => {
    const flat = paths.filter((path) => !path.startsWith('src/ui/a/c/'));
    assert.equal(
      advice('src/ui/a/a.dom.ts', 'src/ui/shared.ts', flat),
      'add shared to card.requires, bound in the dependencies of card.sub and ui.cards and add shared to card.render.dependencies',
    );
  });

  it('requires what sits beside an archetype further out, through each archetype between', () => {
    assert.equal(
      advice('src/ui/a/a.dom.ts', 'src/domain/order.ts'),
      'add domain to card.requires, bound in the dependencies of card.sub and ui.cards, add domain to ui.requires, bound in the dependencies of root.ui and add domain to card.render.dependencies',
    );
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

  it('names a module beside the holder of an inline module, from the module inside it', () => {
    const files = ['src/domain/order.ts', 'src/adapters/db/db.ts', 'src/adapters/db/db.test.ts'];
    const { config } = loadConfigData(
      parse(`
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    adapters:
      dir: src/adapters
      modules:
        db:
          dir: db
          test: { modules: { tests: { files: '*.test.ts' } } }
`),
    );
    const model = resolveModel(config, folders(files), files);
    const fixed = (from: string) => sentence(fixSteps(model, fixesFor(config, model, from, 'src/domain/order.ts')!));
    assert.equal(fixed('src/adapters/db/db.ts'), 'add domain to root.adapters.db.dependencies');
    assert.equal(fixed('src/adapters/db/db.test.ts'), 'add domain to root.adapters.db.tests.dependencies');
  });

  it('requires a module from above an inline module that holds the archetype', () => {
    const nested = `
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    area:
      dir: src/area
      modules:
        comps: { dir: '*', archetype: comp }
archetypes:
  comp:
    modules:
      logic: { files: '*.ts' }
`;
    const files = ['src/domain/order.ts', 'src/area/a/a.ts'];
    assert.equal(
      advice('src/area/a/a.ts', 'src/domain/order.ts', files, nested),
      'add domain to comp.requires, bound in the dependencies of root.area.comps and add domain to comp.logic.dependencies',
    );
  });

  it('names a module that a nearer one shadows with top., and offers no name where top. cannot reach', () => {
    const shadowed = `
root:
  modules:
    core: { dir: src/core, exposes: all }
    feat:
      dir: src/feat
      modules:
        core: { dir: core, exposes: all }
        sub:
          dir: sub
          modules:
            core: { dir: core, exposes: all }
            leaf: { files: leaf.ts }
`;
    const files = ['src/core/a.ts', 'src/feat/core/b.ts', 'src/feat/sub/core/c.ts', 'src/feat/sub/leaf.ts'];
    assert.equal(
      advice('src/feat/sub/leaf.ts', 'src/core/a.ts', files, shadowed),
      'add top.core to root.feat.sub.leaf.dependencies',
    );
    assert.equal(advice('src/feat/sub/leaf.ts', 'src/feat/core/b.ts', files, shadowed), 'no declared path');
  });

  it('names the one surface that holds the target, ahead of the whole module', () => {
    const files = ['src/main.ts', 'src/ui/view.tsx'];
    const { config } = loadConfigData(
      parse(`
root:
  modules:
    ui: { dir: src/ui, archetype: ui }
    main: { files: src/main.ts }
archetypes:
  ui:
    exposes: [render]
    modules:
      render: { files: '*.tsx', exposes: all }
`),
    );
    const model = resolveModel(config, folders(files), files);
    assert.equal(
      sentence(fixSteps(model, fixesFor(config, model, 'src/main.ts', 'src/ui/view.tsx')!)),
      'add ui.render to root.main.dependencies',
    );
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
