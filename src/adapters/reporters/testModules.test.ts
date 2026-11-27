import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { compileConfig } from '../../domain/language/compile.ts';
import { grantText, verdicts } from '../../domain/model/reach.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import { modelText } from './model.ts';

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
  'e2e/flow.test.ts',
  'e2e/steps.ts',
  'src/main.ts',
  'src/domain/order.ts',
  'src/domain/order.test.ts',
  'src/seed/orders.ts',
  'src/a/a.ts',
  'src/a/a.dom.ts',
  'src/a/a.test.ts',
  'src/a/a.dsl.ts',
  'src/a/b/b.ts',
  'src/a/b/b.dom.ts',
  'src/a/b/b.test.ts',
  'src/a/b/b.dsl.ts',
  'src/a/b/b.fixture.ts',
];

const load = (yaml: string) => {
  const raw = parse(yaml);
  return compileConfig({ ...raw, root: { ruleset: { rules: { '*': 'on' } }, ...raw.root } });
};

const shopYaml = `
root:
  modules:
    domain:
      dir: src/domain
      exposes: all
      test: { modules: { tests: { files: '*.test.ts' } } }
    cards: { dir: 'src/*', archetype: card, dependencies: [domain] }
    main: { files: src/main.ts, dependencies: [cards.render] }
  test:
    provides: [seed, npm:vitest]
    modules:
      seed: { dir: src/seed, dependencies: [domain] }
      e2e: { dir: e2e }
archetypes:
  card:
    marker: '{name}.dom.ts'
    requires: [domain]
    exposes: [render]
    modules:
      sub: { dir: '*', archetype: card, dependencies: [domain] }
      logic: { files: '*.ts', exposes: all, dependencies: [domain] }
      render: { files: '{name}.dom.ts', exposes: all }
    test:
      exposes: [dsl]
      modules:
        dsl: { files: '*.dsl.ts' }
        fixture: { files: '*.fixture.ts' }
        tests: { files: '*.test.ts', dependencies: [dsl, fixture, sub.dsl] }
`;

const shop = () => {
  const config = load(shopYaml);
  const model = resolveModel(config, folders(paths), paths);
  const judge = verdicts(config, model);
  const verdict = (from: string, to: string): string => {
    const found = judge.verdict(from, to)!;
    if (found.allowed) return `allowed: ${grantText(found.grant)}`;
    return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
  };
  return { config, model, judge, verdict };
};

describe('test modules', () => {
  it('are listed in warp model under the module that declares them', () => {
    const { model } = shop();
    assert.equal(
      modelText(model),
      [
        '(root)  root: root',
        '  src/domain  domain: root.domain, 1 file',
        '    src/domain:tests  1 test file',
        '  src/a  cards: card {name=a}',
        '    src/a/b  sub: card {name=b}',
        '      src/a/b:logic  1 file',
        '      src/a/b:render  1 file',
        '      src/a/b:dsl  1 test file',
        '      src/a/b:fixture  1 test file',
        '      src/a/b:tests  1 test file',
        '    src/a:logic  1 file',
        '    src/a:render  1 file',
        '    src/a:dsl  1 test file',
        '    src/a:tests  1 test file',
        '  (root):main  1 file',
        '  src/seed  seed: root.seed, 1 test file',
        '  e2e  e2e: root.e2e, 2 test files',
        '',
        '17 modules, 6 files, 9 test files, 0 loose.',
      ].join('\n'),
    );
  });
});

describe('test modules with modules inside', () => {
  const tree = [
    'src/main.ts',
    'src/domain/order.ts',
    'src/domain/order.test.ts',
    'test-helpers/setup.ts',
    'test-helpers/setup.test.ts',
    'test-helpers/order.fixture.ts',
    'test-helpers/clock.ts',
    'test-helpers/drivers/order.driver.ts',
    'e2e/checkout.dsl.ts',
    'e2e/checkout.test.ts',
  ];

  const site = () => {
    const config = load(
      `
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    main: { files: src/main.ts, dependencies: [domain] }
  test:
    provides: [helpers.drivers, npm:vitest]
    modules:
      helpers: { dir: test-helpers, archetype: kit }
      e2e: { dir: e2e, modules: { journeys: { files: '*.dsl.ts' } } }
      tests: { files: '**/*.test.ts', dependencies: [helpers] }
archetypes:
  kit:
    test:
      exposes: [drivers]
      modules:
        fixtures: { files: '*.fixture.ts' }
        clock: { files: clock.ts }
        drivers: { dir: drivers, dependencies: [fixtures] }
`,
    );
    const model = resolveModel(config, folders(tree), tree);
    const judge = verdicts(config, model);
    const verdict = (from: string, to: string): string => {
      const found = judge.verdict(from, to)!;
      return found.allowed ? `allowed: ${grantText(found.grant)}` : found.reason;
    };
    return { config, model, verdict };
  };

  it('are listed in warp model as folders', () => {
    const { model } = site();
    assert.equal(
      modelText(model),
      [
        '(root)  root: root',
        '  src/domain  domain: root.domain, 1 file',
        '  (root):main  1 file',
        '  test-helpers  helpers: kit, 2 test files',
        '    test-helpers:fixtures  1 test file',
        '    test-helpers:clock  1 test file',
        '    test-helpers/drivers  drivers: kit.drivers, 1 test file',
        '  e2e  e2e: root.e2e, 1 test file',
        '    e2e:journeys  1 test file',
        '  (root):tests  1 test file',
        '',
        '10 modules, 2 files, 8 test files, 0 loose.',
      ].join('\n'),
    );
  });
});
