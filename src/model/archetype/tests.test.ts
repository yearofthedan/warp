import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ImportEdge, FileFacts } from '../facts.ts';
import {
  all,
  type AnyArchetype,
  archetype,
  contains,
  dir,
  exposes,
  files,
  mirror,
  pkg,
  ruleset,
  using,
} from './builder.ts';
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

const shop = () => {
  const card = archetype('card')
    .identify({ marker: '{name}.dom.ts' })
    .contains((c, { self }) =>
      c
        .module('sub', dir('{name}'), self)
        .module('logic', files('*.ts'), exposes(all()))
        .module('dom', files('{name}.dom.ts'), exposes(all()))
        .testModule('dsl', files('*.dsl.ts'))
        .testModule('fixture', files('*.fixture.ts'))
        .testModule(
          'tests',
          files('*.test.ts'),
          using((m) => [m.dsl, m.fixture, m.sub.dsl]),
        ),
    )
    .exposes((m) => ({ render: m.dom }))
    .testExposes((m) => ({ dsl: m.dsl }));

  const app = archetype('app')
    .contains((c) =>
      c
        .module('domain', dir('src/domain'), contains((d) => d.testModule('tests', files('*.test.ts'))).exposes(all()))
        .module(
          'cards',
          dir('src/{name}'),
          card.using((m) => [m.domain]),
        )
        .module(
          'main',
          files('src/main.ts'),
          using((m) => [m.cards.render]),
        )
        .testModule(
          'seed',
          dir('src/seed'),
          using((m) => [m.domain]),
        )
        .testModule('e2e', dir('e2e')),
    )
    .testUsing((m) => [m.seed, pkg('vitest')]);

  const { config } = loadConfigData({ root: app }, { builtins: importRules });
  const model = resolveModel(config, folders(paths), paths);
  const judge = verdicts(config, model);
  const verdict = (from: string, to: string): string => {
    const found = judge.verdict(from, to)!;
    if (found.allowed) return `allowed: ${grantText(found.grant)}`;
    return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
  };
  return { app, card, config, model, judge, verdict };
};

describe('test modules', () => {
  it('hold the files their selector claims, the deepest declaring module first, ahead of any production module', () => {
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
      'src/a/a.dom.ts': 'code src/a:dom',
      'src/a/a.test.ts': 'test src/a:tests',
      'src/a/a.dsl.ts': 'test src/a:dsl',
      'src/a/b/b.ts': 'code src/a/b:logic',
      'src/a/b/b.dom.ts': 'code src/a/b:dom',
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
    assert.equal(verdict('src/a/a.test.ts', 'src/domain/order.ts'), 'allowed: app.cards uses m.domain');
  });

  it('reach a test module only where a using or a testUsing names it', () => {
    const { verdict } = shop();
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.dsl.ts'), 'allowed: tests uses m.dsl');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.dsl.ts'), 'allowed: src/a uses src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.fixture.ts'), 'private to src/a/b');
    assert.equal(verdict('src/a/a.dsl.ts', 'src/a/a.test.ts'), 'not-in-using');
    assert.equal(verdict('src/a/b/b.test.ts', 'src/seed/orders.ts'), 'allowed: app.testUsing uses m.seed');
    assert.equal(verdict('src/domain/order.test.ts', 'src/seed/orders.ts'), 'allowed: app.testUsing uses m.seed');
  });

  it("let a test reach another module's test code through a test surface, which production code never may", () => {
    const { verdict } = shop();
    assert.equal(verdict('e2e/flow.test.ts', 'src/a/a.dsl.ts'), 'allowed: (root) uses src/a');
    assert.equal(verdict('e2e/flow.test.ts', 'src/a/a.dom.ts'), 'allowed: (root) uses src/a');
    assert.equal(verdict('src/main.ts', 'src/a/a.dom.ts'), 'allowed: main uses m.cards.render');
    assert.equal(verdict('src/main.ts', 'src/a/a.dsl.ts'), 'test');
    assert.equal(verdict('src/a/a.ts', 'src/a/a.test.ts'), 'test');
  });

  it('reach a test surface below another module only where that module passes it up in its own testExposes', () => {
    const files_ = ['src/ui/card/card.ts', 'src/ui/card/card.dsl.ts', 'e2e/flow.test.ts'];
    const component = archetype('component')
      .contains((c) => c.module('code', files('*.ts'), exposes(all())).testModule('dsl', files('*.dsl.ts')))
      .exposes((m) => ({ render: m.code }))
      .testExposes((m) => ({ render: m.dsl }));
    const site = (ui: AnyArchetype) =>
      archetype('site').contains((c) => c.module('ui', dir('src/ui'), ui).testModule('e2e', dir('e2e')));
    const judge = (ui: AnyArchetype) => {
      const { config } = loadConfigData({ root: site(ui) });
      const found = verdicts(config, resolveModel(config, folders(files_), files_));
      return ['src/ui/card/card.ts', 'src/ui/card/card.dsl.ts'].map(
        (to) => found.verdict('e2e/flow.test.ts', to)!.allowed,
      );
    };
    const ui = () => archetype('ui').contains((c) => c.module('components', dir('{name}'), component));
    assert.deepEqual(judge(ui().exposes(all())), [true, false]);
    assert.deepEqual(
      judge(
        ui()
          .exposes(all())
          .testExposes((m) => ({ components: m.components.render })),
      ),
      [true, true],
    );
  });

  it("pass each archetype's testUsing to every test module at and below its modules, never to production code", () => {
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

  it('tell a test reaching above its module to name it in a testUsing', () => {
    const { config, model } = shop();
    const [finding] = checkModel(
      config,
      model,
      { files: [facts('src/a/a.test.ts', [edge('src/a/a.test.ts', 'src/main.ts')])] },
      importRules,
    );
    assert.equal(
      finding!.message,
      "src/a/a.test.ts (test module tests of card src/a) imports src/main.ts (main of app (root)), which is above src/a. Add 'src/main.ts' to what app.main exposes and add m.main to the testUsing of app, or move the code. (+8 more in reach)",
    );
  });

  it('are listed in warp model under the module that declares them', () => {
    const { model } = shop();
    assert.equal(
      modelText(model),
      [
        '(root)  root: app',
        '  src/domain  domain: app.domain, 1 file',
        '    src/domain:tests  1 test file',
        '  src/a  cards: card {name=a}',
        '    src/a/b  sub: card {name=b}',
        '      src/a/b:logic  1 file',
        '      src/a/b:dom  1 file',
        '      src/a/b:dsl  1 test file',
        '      src/a/b:fixture  1 test file',
        '      src/a/b:tests  1 test file',
        '    src/a:logic  1 file',
        '    src/a:dom  1 file',
        '    src/a:dsl  1 test file',
        '    src/a:tests  1 test file',
        '  (root):main  1 file',
        '  src/seed  seed: app.seed, 1 test file',
        '  e2e  e2e: app.e2e, 2 test files',
        '',
        '17 modules, 6 files, 9 test files, 0 loose.',
      ].join('\n'),
    );
  });

  it('leave a file no test module claims to production, loose where no files module matches it', () => {
    const app = archetype('app').contains((c) => c.module('main', files('main.ts')));
    const { config } = loadConfigData({ root: app });
    const all = ['main.ts', 'main.test.ts'];
    const model = resolveModel(config, folders(all), all);
    assert.equal(model.isTest('main.test.ts'), false);
    assert.deepEqual(model.root.looseFiles, ['main.test.ts']);
    assert.deepEqual(
      failures(() => loadConfigData({ root: app, tests: files('*.test.ts') } as never)),
      ['config: unknown key tests'],
    );
  });

  it("give a file several test modules claim to the longer literal ending, refuse ties, and leave a dir() test module's folder to it", () => {
    const app = archetype('app').contains((c) =>
      c
        .testModule('e2e', dir('e2e'))
        .testModule('journeys', files('**/*.dsl.ts'))
        .testModule('helpers', files('**/*.ts'))
        .testModule('unit', files('*.test.ts'))
        .testModule('specs', files('*.test.ts')),
    );
    const { config } = loadConfigData({ root: app });
    const claimed = ['kit/journey.dsl.ts', 'kit/writer.ts', 'e2e/journey.dsl.ts'];
    const model = resolveModel(config, folders(claimed), claimed);
    assert.deepEqual(
      claimed.map((file) => model.moduleOf(file)!.id),
      ['(root):journeys', '(root):helpers', 'e2e'],
    );
    assert.deepEqual(
      failures(() => resolveModel(config, folders(['b.test.ts']), ['b.test.ts'])),
      [
        "b.test.ts: claimed by app's test modules unit and specs, which are equally specific; narrow one of their selectors",
      ],
    );
  });

  it('take settings from a ruleset line on themselves or on any module above them', () => {
    const rulesFor = (target: (built: ReturnType<typeof shop>) => unknown) => {
      const built = shop();
      const { config } = loadConfigData(
        {
          root: built.app,
          rulesets: { default: ruleset().on(target(built) as never, { 'function-cohesion': false }) },
        },
        { builtins: importRules },
      );
      const on = settings(config, resolveModel(config, folders(paths), paths));
      return ['src/a/a.test.ts', 'src/a/a.dsl.ts', 'e2e/flow.test.ts', 'src/a/a.ts'].filter(
        (file) => !on.atFile(file, 'function-cohesion').on,
      );
    };
    assert.deepEqual(
      rulesFor(({ card }) => card.modules.tests),
      ['src/a/a.test.ts'],
    );
    assert.deepEqual(
      rulesFor(({ app }) => app.modules.e2e),
      ['e2e/flow.test.ts'],
    );
    assert.deepEqual(
      rulesFor(({ card }) => card),
      ['src/a/a.test.ts', 'src/a/a.dsl.ts', 'src/a/a.ts'],
    );
  });

  it('refuse a folder archetype on a files test module, production modules inside a test module, and production code naming one', () => {
    const named = archetype('named');
    const shared = archetype('shared').contains((c) => c.module('x', files('x.ts')));
    const odd = archetype('odd')
      .contains((c, { self }) =>
        c
          .testModule('kit', files('*.kit.ts'))
          .testModule('one', files('one.test.ts'), named as never)
          .testModule('two', dir('two'), contains((t) => t.module('x', files('x.ts'))).testUsing([]))
          .testModule(
            'three',
            dir('three'),
            exposes(all()).testExposes(() => ({})),
          )
          .testModule('four', dir('four'), self)
          .module('five', dir('five'), shared)
          .testModule('six', dir('six'), shared)
          .module(
            'code',
            files('*.ts'),
            using((m) => [m.kit, m.two]),
          )
          .module('loose', files('l.ts'), exposes(all()).testUsing([]) as never)
          .module('misplaced', mirror('src', 'test') as never),
      )
      .provides((m) => ({ kit: m.kit }));
    assert.deepEqual(
      failures(() => loadConfigData({ root: odd })),
      [
        'shared is given to both .module() and .testModule(); an archetype holds production code or test code',
        'odd.one: an archetype makes a folder module; use dir(...), not files(...)',
        "odd.four: self is the holder's archetype, which holds production code; name an archetype for the test module",
        'odd.loose.testUsing: a files module has no modules; use dir(...) for testUsing',
        "odd.misplaced: expected a selector, files('*.ts') or dir('src/ui')",
        'odd.two.testUsing: odd.two holds test code; give it using(...)',
        'odd.two.x: odd.two holds test code; declare its modules with .testModule(...)',
        'odd.three.testExposes: odd.three holds test code, so what it exposes is for tests already; use exposes(...)',
        'odd.code uses kit; kit is a test module, which only test modules and testUsing may name',
        'odd.code uses two; two is a test module, which only test modules and testUsing may name',
        'odd provides kit as kit; kit is a test module, which only test modules and testUsing may name',
      ],
    );
  });

  it('refuse test code on a production surface, and production code naming a test surface', () => {
    const part = archetype('part')
      .contains((c) => c.module('code', files('*.ts'), exposes(all())).testModule('kit', files('*.kit.ts')))
      .exposes((m) => ({ code: m.code, kit: m.kit }))
      .testExposes((m) => ({ dsl: m.kit }));
    const odd = archetype('odd').contains((c) =>
      c
        .module('parts', dir('{name}'), part)
        .module(
          'main',
          files('main.ts'),
          using((m) => [m.parts.dsl]),
        )
        .testModule(
          'e2e',
          dir('e2e'),
          using((m) => [m.parts.dsl]),
        ),
    );
    assert.deepEqual(
      failures(() => loadConfigData({ root: odd })),
      [
        'odd.main uses parts.dsl; dsl is a test surface of parts (part), which only test modules and testUsing may name',
        'part exposes kit as kit; kit is a test module, and exposes is production code: name it in testExposes',
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

  const site = () => {
    const kit = archetype('kit')
      .contains((c) =>
        c
          .testModule('fixtures', files('*.fixture.ts'))
          .testModule('clock', files('clock.ts'))
          .testModule(
            'drivers',
            dir('drivers'),
            using((m) => [m.fixtures]),
          ),
      )
      .exposes((m) => ({ drivers: m.drivers }));
    const app = archetype('app')
      .contains((c) =>
        c
          .module('domain', dir('src/domain'), exposes(all()))
          .module(
            'main',
            files('src/main.ts'),
            using((m) => [m.domain]),
          )
          .testModule('helpers', dir('test-helpers'), kit)
          .testModule(
            'e2e',
            dir('e2e'),
            contains((e) => e.testModule('journeys', files('*.dsl.ts'))),
          )
          .testModule('tests', files('**/*.test.ts')),
      )
      .testUsing((m) => [m.helpers.drivers, pkg('vitest')]);
    const { config } = loadConfigData({ root: app }, { builtins: importRules });
    const model = resolveModel(config, folders(tree), tree);
    const judge = verdicts(config, model);
    const verdict = (from: string, to: string): string => {
      const found = judge.verdict(from, to)!;
      return found.allowed ? `allowed: ${grantText(found.grant)}` : found.reason;
    };
    return { app, kit, config, model, verdict };
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

  it("reach what their using names and what the module holding them reaches, and their own modules' surfaces", () => {
    const { verdict } = site();
    assert.equal(
      verdict('test-helpers/drivers/order.driver.ts', 'test-helpers/order.fixture.ts'),
      'allowed: kit.drivers uses m.fixtures',
    );
    assert.equal(verdict('test-helpers/drivers/order.driver.ts', 'test-helpers/clock.ts'), 'not-in-using');
    assert.equal(verdict('test-helpers/order.fixture.ts', 'src/domain/order.ts'), 'allowed: (root) uses src/domain');
    assert.equal(
      verdict('test-helpers/setup.ts', 'test-helpers/drivers/order.driver.ts'),
      'allowed: test-helpers uses test-helpers/drivers',
    );
    assert.equal(verdict('e2e/checkout.test.ts', 'e2e/checkout.dsl.ts'), 'allowed: e2e uses e2e:journeys');
  });

  it('tell a test module inside one to name its sibling in its using', () => {
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
    assert.match(finding!.message, /Add m\.clock to the using of kit\.drivers/);
  });

  it('show tests outside only what they expose, and production code none of it', () => {
    const { verdict } = site();
    assert.equal(
      verdict('src/domain/order.test.ts', 'test-helpers/drivers/order.driver.ts'),
      'allowed: app.testUsing uses m.helpers.drivers',
    );
    assert.equal(verdict('src/domain/order.test.ts', 'test-helpers/order.fixture.ts'), 'private');
    assert.equal(verdict('src/main.ts', 'test-helpers/drivers/order.driver.ts'), 'test');
  });

  it('take settings by the handle their archetype gives each module', () => {
    const { app, kit } = site();
    const off = (target: unknown) => {
      const { config } = loadConfigData(
        { root: app, rulesets: { default: ruleset().on(target as never, { 'function-cohesion': false }) } },
        { builtins: importRules },
      );
      const on = settings(config, resolveModel(config, folders(tree), tree));
      return tree.filter((file) => !on.atFile(file, 'function-cohesion').on);
    };
    assert.deepEqual(off(app.modules.e2e.modules.journeys), ['e2e/checkout.dsl.ts']);
    assert.deepEqual(off(kit.modules.drivers), ['test-helpers/drivers/order.driver.ts']);
  });

  it('are listed in warp model as folders', () => {
    const { model } = site();
    assert.equal(
      modelText(model),
      [
        '(root)  root: app',
        '  src/domain  domain: app.domain, 1 file',
        '  (root):main  1 file',
        '  test-helpers  helpers: kit, 2 test files',
        '    test-helpers:fixtures  1 test file',
        '    test-helpers:clock  1 test file',
        '    test-helpers/drivers  drivers: kit.drivers, 1 test file',
        '  e2e  e2e: app.e2e, 1 test file',
        '    e2e:journeys  1 test file',
        '  (root):tests  1 test file',
        '',
        '10 modules, 2 files, 8 test files, 0 loose.',
      ].join('\n'),
    );
  });
});

describe('mirrored test modules', () => {
  const mirrored = [
    'src/ui/project/project.dom.ts',
    'src/ui/project/graph/graph.dom.ts',
    'test/ui/project/project.test.ts',
    'test/ui/project/helpers.ts',
    'test/ui/project/graph/graph.test.ts',
  ];

  const site = (from = 'src', to = 'test') => {
    const component = archetype('component')
      .identify({ marker: '{name}.dom.ts' })
      .contains((c, { self }) =>
        c
          .module('sub', dir('{name}'), self)
          .module('code', files('*.ts'), exposes(all()))
          .testModule('tests', mirror(from, to)),
      )
      .exposes(all());
    return archetype('site').contains((c) =>
      c
        .module('ui', dir('src/ui'), contains((u) => u.module('components', dir('{name}'), component)).exposes(all()))
        .module('test', dir('test'), exposes(all())),
    );
  };

  it("hold the files under their module's folder with one prefix swapped, the longest mirror first", () => {
    const { config } = loadConfigData({ root: site() });
    const model = resolveModel(config, folders(mirrored), mirrored);
    assert.deepEqual(Object.fromEntries(mirrored.map((file) => [file, model.moduleOf(file)!.id])), {
      'src/ui/project/project.dom.ts': 'src/ui/project:code',
      'src/ui/project/graph/graph.dom.ts': 'src/ui/project/graph:code',
      'test/ui/project/project.test.ts': 'src/ui/project:tests',
      'test/ui/project/helpers.ts': 'src/ui/project:tests',
      'test/ui/project/graph/graph.test.ts': 'src/ui/project/graph:tests',
    });
    const judge = verdicts(config, model);
    assert.ok(judge.verdict('test/ui/project/project.test.ts', 'src/ui/project/project.dom.ts')!.allowed);
  });

  it('refuse a module outside the mirrored folder', () => {
    const { config } = loadConfigData({ root: site('lib', 'test') });
    assert.deepEqual(
      failures(() => resolveModel(config, folders(mirrored), mirrored)),
      [
        "src/ui/project: component.tests mirror('lib', 'test') needs a folder under lib; this module is not in it",
        "src/ui/project/graph: component.tests mirror('lib', 'test') needs a folder under lib; this module is not in it",
      ],
    );
  });

  it('refuse a mirror whose paths are not plain folders', () => {
    assert.deepEqual(
      failures(() => loadConfigData({ root: site('src/{name}', 'test') })),
      ["component.tests: mirror() takes two folder paths without placeholders, mirror('src', 'test')"],
    );
  });
});
