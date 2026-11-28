import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import type { ImportEdge, FileFacts } from '../domain/facts/facts.ts';
import { builtinRules, warp } from '../builtins/index.ts';
import { checkModel } from './checkModel.ts';
import { loadConfigData } from './load.ts';
import { grantText, verdicts } from '../domain/model/reach.ts';
import { type Folders, resolveModel } from '../domain/model/resolve.ts';

const importRules = builtinRules.filter((rule) => rule.id !== 'unused-declaration');

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

const edge = (from: string, to: string): ImportEdge => ({
  from,
  to,
  specifier: `./${to}`,
  names: ['x'],
  typeOnly: false,
  line: 1,
});

const facts = (path: string, imports: ImportEdge[]): FileFacts => ({
  path,
  lines: 10,
  imports,
  externals: [],
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
  classes: [],
  chains: [],
  exports: [],
});

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
  return loadConfigData(
    { ...raw, root: { ruleset: { extends: ['warp:boundaries', 'warp:cohesion', 'warp:coupling'] }, ...raw.root } },
    { builtins: warp },
  ).config;
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
  it('report production code importing a test file, and put no test edge in a module cycle', () => {
    const { config, model } = shop();
    const findings = checkModel(
      config,
      model,
      {
        files: [
          facts('src/a/a.ts', [edge('src/a/a.ts', 'src/a/a.dsl.ts')]),
          facts('src/domain/order.ts', [edge('src/domain/order.ts', 'src/main.ts')]),
          facts('src/main.ts', [edge('src/main.ts', 'src/a/a.dom.ts')]),
          facts('src/domain/order.test.ts', [edge('src/domain/order.test.ts', 'src/main.ts')]),
        ],
      },
      importRules,
    );
    assert.deepEqual(
      findings.map((finding) => finding.key),
      [
        'dependency-direction:src/a/a.ts->src/a/a.dsl.ts',
        'dependency-direction:src/domain/order.ts->src/main.ts',
        'dependency-direction:src/domain/order.test.ts->src/main.ts',
      ],
    );
    assert.equal(
      findings[0]!.message,
      'src/a/a.ts (logic of card src/a) imports src/a/a.dsl.ts (test module dsl of card src/a), a test file. Production code never imports tests: move what both need out of the test file into the module it tests.',
    );
  });

  it('tell a test reaching above its module to name it in a test.provides', () => {
    const { config, model } = shop();
    const [finding] = checkModel(
      config,
      model,
      { files: [facts('src/a/a.test.ts', [edge('src/a/a.test.ts', 'src/main.ts')])] },
      importRules,
    );
    assert.equal(
      finding!.message,
      "src/a/a.test.ts (test module tests of card src/a) imports src/main.ts (main of root (root)), which is above src/a. Add 'src/main.ts' to the files of root.main.exposes and add main to root.test.provides, or move the code. (+9 more in reach)",
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

  it('tell a test module inside one to name its sibling in its dependencies', () => {
    const { config, model } = site();
    const [finding] = checkModel(
      config,
      model,
      {
        files: [
          facts('test-helpers/drivers/order.driver.ts', [
            edge('test-helpers/drivers/order.driver.ts', 'test-helpers/clock.ts'),
          ]),
        ],
      },
      importRules,
    );
    assert.match(finding!.message, /Add clock to kit\.drivers\.dependencies/);
  });
});
