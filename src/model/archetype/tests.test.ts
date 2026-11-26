import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import type { ImportEdge, FileFacts } from '../facts.ts';
import { builtinRules } from '../../builtins/index.ts';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { ConfigError } from '../configError.ts';
import { grantText, verdicts } from './reach.ts';
import { type Folders, resolveModel } from './resolve.ts';
import { settings } from './settings.ts';
import { modelText } from '../../reporters/model.ts';

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

const failures = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  assert.fail('expected a ConfigError');
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

const recommended = (on = '') => `
rulesets:
  default:
    extends: [warp:recommended]
${on === '' ? '' : `    on: ${on}\n`}`;

const load = (yaml: string, on = '') =>
  loadConfigData(parse(`${yaml}${recommended(on)}`), { builtins: importRules }).config;

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

const shop = (on = '') => {
  const config = load(shopYaml, on);
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
  it('hold the files their pattern claims, the deepest declaring module first, ahead of any production module', () => {
    const { model } = shop();
    const owner = (file: string) => `${model.isTest(file) ? 'test' : 'code'} ${model.moduleOf(file)!.id}`;
    assert.deepEqual(Object.fromEntries(paths.map((file) => [file, owner(file)])), {
      'e2e/flow.test.ts': 'test e2e',
      'e2e/steps.ts': 'test e2e',
      'src/main.ts': 'code (root):main',
      'src/domain/order.ts': 'code src/domain',
      'src/domain/order.test.ts': 'test src/domain:tests',
      'src/seed/orders.ts': 'test src/seed',
      'src/a/a.ts': 'code src/a:logic',
      'src/a/a.dom.ts': 'code src/a:render',
      'src/a/a.test.ts': 'test src/a:tests',
      'src/a/a.dsl.ts': 'test src/a:dsl',
      'src/a/b/b.ts': 'code src/a/b:logic',
      'src/a/b/b.dom.ts': 'code src/a/b:render',
      'src/a/b/b.test.ts': 'test src/a/b:tests',
      'src/a/b/b.dsl.ts': 'test src/a/b:dsl',
      'src/a/b/b.fixture.ts': 'test src/a/b:fixture',
    });
  });

  it("reach their own files, their module's files and modules, its children's surfaces, and what it uses", () => {
    const { verdict } = shop();
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.test.ts'), 'allowed: own module src/a:tests');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.ts'), 'allowed: src/a:tests uses src/a');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.dom.ts'), 'allowed: src/a uses src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.ts'), 'private to src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/domain/order.ts'), 'allowed: root.cards uses domain');
  });

  it('reach a test module only where its dependencies or a test.provides names it', () => {
    const { verdict } = shop();
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.dsl.ts'), 'allowed: tests uses dsl');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.dsl.ts'), 'allowed: src/a uses src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.fixture.ts'), 'private to src/a/b');
    assert.equal(verdict('src/a/a.dsl.ts', 'src/a/a.test.ts'), 'not-in-dependencies');
    assert.equal(verdict('src/a/b/b.test.ts', 'src/seed/orders.ts'), 'allowed: root.test.provides uses seed');
    assert.equal(verdict('src/domain/order.test.ts', 'src/seed/orders.ts'), 'allowed: root.test.provides uses seed');
  });

  it("let a test reach another module's test code through a test surface, which production code never may", () => {
    const { verdict } = shop();
    assert.equal(verdict('e2e/flow.test.ts', 'src/a/a.dsl.ts'), 'allowed: (root) uses src/a');
    assert.equal(verdict('e2e/flow.test.ts', 'src/a/a.dom.ts'), 'allowed: (root) uses src/a');
    assert.equal(verdict('src/main.ts', 'src/a/a.dom.ts'), 'allowed: main uses cards.render');
    assert.equal(verdict('src/main.ts', 'src/a/a.dsl.ts'), 'test');
    assert.equal(verdict('src/a/a.ts', 'src/a/a.test.ts'), 'test');
  });

  it('reach a test surface below another module only where that module passes it up in its own test.exposes', () => {
    const files_ = ['src/ui/card/card.ts', 'src/ui/card/card.dsl.ts', 'e2e/flow.test.ts'];
    const judge = (ui: string) => {
      const config = load(`
root:
  modules:
    ui: { dir: src/ui, archetype: ui }
  test: { modules: { e2e: { dir: e2e } } }
archetypes:
  component:
    exposes: [code]
    modules:
      code: { files: '*.ts', exposes: all }
    test:
      exposes: [dsl]
      modules:
        dsl: { files: '*.dsl.ts' }
  ui:
    exposes: all
    modules:
      components: { dir: '*', archetype: component }
${ui}`);
      const found = verdicts(config, resolveModel(config, folders(files_), files_));
      return ['src/ui/card/card.ts', 'src/ui/card/card.dsl.ts'].map(
        (to) => found.verdict('e2e/flow.test.ts', to)!.allowed,
      );
    };
    assert.deepEqual(judge(''), [true, false]);
    assert.deepEqual(judge('    test: { exposes: [components.dsl] }'), [true, true]);
  });

  it('pass each test.provides to every test module at and below its modules, never to production code', () => {
    const { judge } = shop();
    const packages = (file: string) =>
      judge
        .reach(file)!
        .flatMap((grant) => grant.package ?? [])
        .join(', ');
    assert.equal(packages('src/a/b/b.test.ts'), 'vitest');
    assert.equal(packages('e2e/flow.test.ts'), 'vitest');
    assert.equal(packages('src/a/a.ts'), '');
  });

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

  it('leave a file no test module claims to production, loose where no files module matches it', () => {
    const config = load('root: { modules: { main: { files: main.ts } } }');
    const all = ['main.ts', 'main.test.ts'];
    const model = resolveModel(config, folders(all), all);
    assert.equal(model.isTest('main.test.ts'), false);
    assert.deepEqual(model.root.looseFiles, ['main.test.ts']);
  });

  it("give a file several test modules claim to the longer literal ending, refuse ties, and leave a dir test module's folder to it", () => {
    const config = load(`
root:
  test:
    modules:
      e2e: { dir: e2e }
      journeys: { files: '**/*.dsl.ts' }
      helpers: { files: '**/*.ts' }
      unit: { files: '*.test.ts' }
      specs: { files: '*.test.ts' }
`);
    const claimed = ['kit/journey.dsl.ts', 'kit/writer.ts', 'e2e/journey.dsl.ts'];
    const model = resolveModel(config, folders(claimed), claimed);
    assert.deepEqual(
      claimed.map((file) => model.moduleOf(file)!.id),
      ['(root):journeys', '(root):helpers', 'e2e'],
    );
    assert.deepEqual(
      failures(() => resolveModel(config, folders(['b.test.ts']), ['b.test.ts'])),
      [
        "b.test.ts: claimed by root's test modules unit and specs, which are equally specific; narrow one of their patterns",
      ],
    );
  });

  it('take settings from a ruleset line on themselves or on any module above them', () => {
    const rulesFor = (target: string) => {
      const { config } = shop(`{ ${target}: { function-cohesion: off } }`);
      const on = settings(config, resolveModel(config, folders(paths), paths));
      return ['src/a/a.test.ts', 'src/a/a.dsl.ts', 'e2e/flow.test.ts', 'src/a/a.ts'].filter(
        (file) => !on.atFile(file, 'function-cohesion').on,
      );
    };
    assert.deepEqual(rulesFor('card.tests'), ['src/a/a.test.ts']);
    assert.deepEqual(rulesFor('root.e2e'), ['e2e/flow.test.ts']);
    assert.deepEqual(rulesFor('card'), ['src/a/a.test.ts', 'src/a/a.dsl.ts', 'src/a/a.ts']);
  });

  it('refuse an archetype used for production and test code, and production code naming a test module', () => {
    assert.deepEqual(
      failures(() =>
        load(`
root:
  modules:
    five: { dir: five, archetype: shared }
    odd: { dir: odd, archetype: odd }
  test:
    modules:
      six: { dir: six, archetype: shared }
archetypes:
  shared: { modules: { x: { files: x.ts } } }
  odd:
    modules:
      code: { files: '*.ts', dependencies: [kit, two] }
    test:
      modules:
        kit: { files: '*.kit.ts' }
        two: { dir: two }
`),
      ),
      [
        "odd.code.dependencies: 'kit': kit is a test module, which only test code may name",
        "odd.code.dependencies: 'two': two is a test module, which only test code may name",
        'shared is used by production and test modules; an archetype holds one or the other',
      ],
    );
  });

  it('refuse test code on a production surface, and production code naming a test surface', () => {
    assert.deepEqual(
      failures(() =>
        load(`
root:
  modules:
    parts: { dir: '*', archetype: part }
    main: { files: main.ts, dependencies: [parts.dsl] }
  test:
    modules:
      e2e: { dir: e2e, dependencies: [parts.dsl] }
archetypes:
  part:
    exposes: [code, kit]
    modules:
      code: { files: '*.ts', exposes: all }
    test:
      exposes: [dsl]
      modules:
        dsl: { files: '*.dsl.ts' }
        kit: { files: '*.kit.ts' }
`),
      ),
      [
        "part.exposes: 'kit': kit is a test module, and exposes is production code: name it in test.exposes",
        "root.main.dependencies: 'parts.dsl': dsl is a test surface of parts (part), which only test code may name",
      ],
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

  const site = (on = '') => {
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
      on,
    );
    const model = resolveModel(config, folders(tree), tree);
    const judge = verdicts(config, model);
    const verdict = (from: string, to: string): string => {
      const found = judge.verdict(from, to)!;
      return found.allowed ? `allowed: ${grantText(found.grant)}` : found.reason;
    };
    return { config, model, verdict };
  };

  it('hold the files their own test modules leave, which no test module above them claims', () => {
    const { model } = site();
    assert.deepEqual(Object.fromEntries(tree.map((file) => [file, model.moduleOf(file)!.id])), {
      'src/main.ts': '(root):main',
      'src/domain/order.ts': 'src/domain',
      'src/domain/order.test.ts': '(root):tests',
      'test-helpers/setup.ts': 'test-helpers',
      'test-helpers/setup.test.ts': 'test-helpers',
      'test-helpers/order.fixture.ts': 'test-helpers:fixtures',
      'test-helpers/clock.ts': 'test-helpers:clock',
      'test-helpers/drivers/order.driver.ts': 'test-helpers/drivers',
      'e2e/checkout.dsl.ts': 'e2e:journeys',
      'e2e/checkout.test.ts': 'e2e',
    });
    assert.ok(tree.filter((file) => !file.startsWith('src/') || file.endsWith('.test.ts')).every(model.isTest));
  });

  it("reach what their dependencies name and what the module holding them reaches, never into their own folder through a test kit, and their own modules' surfaces", () => {
    const { verdict } = site();
    assert.equal(
      verdict('test-helpers/drivers/order.driver.ts', 'test-helpers/order.fixture.ts'),
      'allowed: kit.drivers uses fixtures',
    );
    assert.equal(verdict('test-helpers/drivers/order.driver.ts', 'test-helpers/clock.ts'), 'not-in-dependencies');
    assert.equal(
      verdict('test-helpers/order.fixture.ts', 'test-helpers/drivers/order.driver.ts'),
      'not-in-dependencies',
    );
    assert.equal(verdict('test-helpers/order.fixture.ts', 'src/domain/order.ts'), 'allowed: (root) uses src/domain');
    assert.equal(
      verdict('test-helpers/setup.ts', 'test-helpers/drivers/order.driver.ts'),
      'allowed: test-helpers uses test-helpers/drivers',
    );
    assert.equal(verdict('e2e/checkout.test.ts', 'e2e/checkout.dsl.ts'), 'allowed: e2e uses e2e:journeys');
  });

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

  it('show tests outside only what they expose, and production code none of it', () => {
    const { verdict } = site();
    assert.equal(
      verdict('src/domain/order.test.ts', 'test-helpers/drivers/order.driver.ts'),
      'allowed: tests uses helpers',
    );
    assert.equal(verdict('src/domain/order.test.ts', 'test-helpers/order.fixture.ts'), 'private');
    assert.equal(verdict('src/main.ts', 'test-helpers/drivers/order.driver.ts'), 'test');
  });

  it('take settings by the path of each module', () => {
    const off = (target: string) => {
      const { config } = site(`{ ${target}: { function-cohesion: off } }`);
      const on = settings(config, resolveModel(config, folders(tree), tree));
      return tree.filter((file) => !on.atFile(file, 'function-cohesion').on);
    };
    assert.deepEqual(off('root.e2e.journeys'), ['e2e/checkout.dsl.ts']);
    assert.deepEqual(off('kit.drivers'), ['test-helpers/drivers/order.driver.ts']);
  });

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
