import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ImportEdge, FileFacts } from '../facts.ts';
import { all, archetype, contains, dir, exposes, files, pkg, ruleset, using } from './builder.ts';
import { builtinRules } from '../../builtins/index.ts';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
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

const paths = [
  'src/main.ts',
  'src/main.test.ts',
  'src/domain/order.ts',
  'src/domain/order.test.ts',
  'src/a/a.ts',
  'src/a/a.dom.ts',
  'src/a/a.test.ts',
  'src/a/b/b.ts',
  'src/a/b/b.dom.ts',
];

const cardApp = () => {
  const card = archetype('card')
    .identify({ marker: '{name}.dom.ts' })
    .contains((m, { self }) =>
      m
        .module('sub', dir('{name}'), self)
        .module('logic', files('*.ts'), exposes(all()))
        .module('dom', files('{name}.dom.ts'), exposes(all())),
    )
    .exposes((m) => ({ render: m.dom }));

  const app = archetype('app').contains((m) =>
    m
      .module('domain', dir('src/domain'), exposes(all()))
      .module(
        'cards',
        dir('src/{name}'),
        card.using((m) => [m.domain]),
      )
      .module('main', files('src/main.ts')),
  );

  const { config } = loadConfigData({ root: app, tests: files('**/*.test.ts') });
  const model = resolveModel(config, folders(paths), paths);
  const judge = verdicts(config, model);

  const verdict = (from: string, to: string): string => {
    const found = judge.verdict(from, to)!;
    if (found.allowed) return `allowed: ${grantText(found.grant)}`;
    return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
  };
  return { app, config, model, verdict };
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
  members: { members: [], links: [] },
  functions: [],
});

describe('test entry files', () => {
  it('belong to the deepest folder module holding them, never a files module that also matches', () => {
    const { model } = cardApp();
    const owners = paths.filter(model.isTest).map((file) => `${file} ${model.moduleOf(file)!.id}`);
    assert.deepEqual(owners, ['src/main.test.ts .', 'src/domain/order.test.ts src/domain', 'src/a/a.test.ts src/a']);
    assert.deepEqual(model.moduleOf('src/a/a.ts')!.id, 'src/a:logic');
    assert.deepEqual(
      model.modules.flatMap((module) => module.files),
      ['src/domain/order.ts', 'src/a/b/b.ts', 'src/a/b/b.dom.ts', 'src/a/a.ts', 'src/a/a.dom.ts', 'src/main.ts'],
    );
  });

  it("see their module's own files and modules, its children's surfaces, and what the module uses", () => {
    const { verdict } = cardApp();
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.ts'), 'allowed: tests of src/a');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.dom.ts'), 'allowed: tests of src/a');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.dom.ts'), 'allowed: tests of src/a uses src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.ts'), 'private to src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/domain/order.ts'), 'allowed: app.cards uses m.domain');
    assert.equal(verdict('src/main.test.ts', 'src/a/a.ts'), 'private to src/a');
  });

  it('are never imported by production code, while a test may import another test it reaches', () => {
    const { config, model, verdict } = cardApp();
    assert.equal(verdict('src/a/a.ts', 'src/a/a.test.ts'), 'test');
    assert.equal(verdict('src/main.test.ts', 'src/domain/order.test.ts'), 'private to src/domain');
    const findings = checkModel(
      config,
      model,
      { files: [facts('src/a/a.ts', [edge('src/a/a.ts', 'src/a/a.test.ts')])] },
      importRules,
    );
    assert.deepEqual(
      findings.map((finding) => finding.message),
      [
        'src/a/a.ts (logic of card src/a) imports src/a/a.test.ts (a test of card src/a), a test file. Production code never imports tests: move what both need out of the test file into the module it tests.',
      ],
    );
  });

  it('put no edge in a module cycle', () => {
    const { config, model } = cardApp();
    const findings = checkModel(
      config,
      model,
      {
        files: [
          facts('src/main.ts', [edge('src/main.ts', 'src/domain/order.ts')]),
          facts('src/domain/order.test.ts', [edge('src/domain/order.test.ts', 'src/main.ts')]),
        ],
      },
      importRules,
    );
    assert.deepEqual(
      findings.map((finding) => finding.key),
      [
        'dependency-direction:src/main.ts->src/domain/order.ts',
        'dependency-direction:src/domain/order.test.ts->src/main.ts',
      ],
    );
  });

  it('are counted in warp model under their module', () => {
    const { model } = cardApp();
    assert.equal(
      modelText(model),
      [
        '.  root: app, 1 test',
        '  src/domain  domain: app.domain, 1 file, 1 test',
        '  src/a  cards: card {name=a}, 1 test',
        '    src/a/b  sub: card {name=b}',
        '      src/a/b:logic  1 file',
        '      src/a/b:dom  1 file',
        '    src/a:logic  1 file',
        '    src/a:dom  1 file',
        '  .:main  1 file',
        '',
        '9 modules, 6 files, 3 tests, 0 loose.',
      ].join('\n'),
    );
  });

  it('come from the root config only, as files patterns', () => {
    const { app } = cardApp();
    assert.throws(
      () => loadConfigData({ root: app, tests: '**/*.test.ts' as never }),
      /config\.tests: expected the test entry files, files\('\*\*\/\*\.test\.ts', \.\.\.\)/,
    );
    assert.equal(loadConfigData({ root: app }).config.tests, undefined);
  });
});

const sitePaths = [
  'e2e/flow.test.ts',
  'e2e/helpers.ts',
  'src/domain/order.ts',
  'src/a/a.ts',
  'src/a/a.dom.ts',
  'src/a/a.test.ts',
  'src/a/a.logic.test.ts',
  'src/a/a.driver.ts',
  'src/a/b/b.ts',
  'src/a/b/b.dom.ts',
  'src/a/b/b.driver.ts',
  'src/a/b/b.fixture.ts',
];

const siteArchetypes = () => {
  const page = archetype('page')
    .identify({ marker: '{name}.dom.ts' })
    .contains((m, { self }) =>
      m
        .module('sub', dir('{name}'), self)
        .module('logic', files('*.ts'), exposes(all()).tests(files('*.logic.test.ts')))
        .module('dom', files('{name}.dom.ts'), exposes(all())),
    )
    .exposes((m) => ({ render: m.dom }))
    .tests(
      contains((t) => t.module('driver', files('*.driver.ts')).module('fixture', files('*.fixture.ts'))).exposes(
        (t) => ({
          driver: t.driver,
        }),
      ),
    );

  const site = archetype('site')
    .contains((m) =>
      m.module('domain', dir('src/domain'), exposes(all())).module(
        'pages',
        dir('src/{name}'),
        page.using((m) => [m.domain]),
      ),
    )
    .tests(dir('e2e'), using([pkg('vitest')]));
  return { page, site };
};

const siteFixture = () => {
  const { site } = siteArchetypes();
  const siteConfig = loadConfigData({ root: site, tests: files('**/*.test.ts') }).config;
  const siteModel = resolveModel(siteConfig, folders(sitePaths), sitePaths);
  const siteJudge = verdicts(siteConfig, siteModel);
  const siteVerdict = (from: string, to: string): string => {
    const found = siteJudge.verdict(from, to)!;
    if (found.allowed) return `allowed: ${grantText(found.grant)}`;
    return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
  };
  return { siteModel, siteJudge, siteVerdict };
};

describe('test layers', () => {
  it('place test support in the test modules of a layer, a located folder, or a files module that claims its tests', () => {
    const { siteModel } = siteFixture();
    const owner = (file: string) => `${siteModel.isTest(file) ? 'test' : 'code'} ${siteModel.moduleOf(file)!.id}`;
    assert.deepEqual(Object.fromEntries(sitePaths.map((file) => [file, owner(file)])), {
      'e2e/flow.test.ts': 'test .',
      'e2e/helpers.ts': 'test .',
      'src/domain/order.ts': 'code src/domain',
      'src/a/a.ts': 'code src/a:logic',
      'src/a/a.dom.ts': 'code src/a:dom',
      'src/a/a.test.ts': 'test src/a',
      'src/a/a.logic.test.ts': 'test src/a:logic',
      'src/a/a.driver.ts': 'test src/a:tests.driver',
      'src/a/b/b.ts': 'code src/a/b:logic',
      'src/a/b/b.dom.ts': 'code src/a/b:dom',
      'src/a/b/b.driver.ts': 'test src/a/b:tests.driver',
      'src/a/b/b.fixture.ts': 'test src/a/b:tests.fixture',
    });
    assert.deepEqual(siteModel.root.looseFiles, []);
  });

  it("let a module's tests reach its test modules, a child's exposed test surface, and the layers above", () => {
    const { siteVerdict } = siteFixture();
    assert.equal(siteVerdict('src/a/a.test.ts', 'src/a/a.driver.ts'), 'allowed: tests of src/a');
    assert.equal(siteVerdict('src/a/a.test.ts', 'src/a/b/b.driver.ts'), 'allowed: tests of src/a uses src/a/b');
    assert.equal(siteVerdict('src/a/a.test.ts', 'src/a/b/b.fixture.ts'), 'private to src/a/b');
    assert.equal(siteVerdict('src/a/a.driver.ts', 'src/a/a.ts'), 'allowed: tests of src/a');
    assert.equal(siteVerdict('e2e/flow.test.ts', 'e2e/helpers.ts'), 'allowed: tests of .');
    assert.equal(siteVerdict('e2e/flow.test.ts', 'src/a/b/b.driver.ts'), 'private to src/a');
  });

  it('give a files module that claims its tests only its own files', () => {
    const { siteVerdict } = siteFixture();
    assert.equal(siteVerdict('src/a/a.logic.test.ts', 'src/a/a.ts'), 'allowed: tests of src/a:logic');
    assert.equal(siteVerdict('src/a/a.logic.test.ts', 'src/a/a.dom.ts'), 'not-in-using');
  });

  it("pass each layer's using down to every test below it, never to production code", () => {
    const { siteJudge, siteVerdict } = siteFixture();
    const packages = (file: string) =>
      siteJudge
        .reach(file)!
        .flatMap((grant) => grant.package ?? [])
        .join(', ');
    assert.equal(packages('src/a/a.test.ts'), 'vitest');
    assert.equal(packages('src/a/a.logic.test.ts'), 'vitest');
    assert.equal(packages('src/a/b/b.driver.ts'), 'vitest');
    assert.equal(packages('src/a/a.ts'), '');
    assert.equal(siteVerdict('src/a/a.dom.ts', 'src/a/a.driver.ts'), 'test');
  });

  it('refuse a module named tests, a named or folder-shaped layer, and a files module that says not where its tests are', () => {
    const named = archetype('named');
    const odd = archetype('odd')
      .contains((m) =>
        m
          // @ts-expect-error tests names the test layer
          .module('tests', files('t.ts'))
          .module('loose', files('l.ts'), exposes(all()).tests(using([])))
          .module('two', dir('two'), contains((t) => t.module('x', files('x.ts'))).tests(dir('a'), named as never)),
      )
      .tests(contains((t) => t.module('deep', dir('deep')).module('picky', files('p.ts'), using([pkg('x')]))));
    assert.throws(
      () => loadConfigData({ root: odd }),
      (error: Error) => {
        assert.deepEqual(error.message.split('\n'), [
          "odd.tests: tests names a module's test layer; give the module another name",
          "odd.loose.tests: a files module names where its tests are, .tests(files('*.logic.test.ts'))",
          "odd.tests.deep: a test module is a files module, files('*.dsl.ts')",
          'odd.tests.picky: a test module sees what its layer sees; give the layer .using()',
          'odd.two.tests: a test layer is an archetype of its own: contains(...), using(...) or exposes(...)',
        ]);
        return true;
      },
    );
  });
});

describe('test layer rules', () => {
  type Archetypes = ReturnType<typeof siteArchetypes>;
  const rulesFor = (target: (archetypes: Archetypes) => unknown) => {
    const archetypes = siteArchetypes();
    return loadConfigData(
      {
        root: archetypes.site,
        tests: files('**/*.test.ts'),
        rulesets: { default: ruleset().on(target(archetypes) as never, { 'function-cohesion': false }) },
      },
      { builtins: importRules },
    ).config;
  };

  const cohesionOff = (target: (archetypes: Archetypes) => unknown) => {
    const config = rulesFor(target);
    const on = settings(config, resolveModel(config, folders(sitePaths), sitePaths));
    const files = ['src/a/a.test.ts', 'src/a/a.driver.ts', 'src/a/b/b.fixture.ts', 'e2e/flow.test.ts', 'src/a/a.ts'];
    return files.filter((file) => !on.atFile(file, 'function-cohesion').on);
  };

  it("apply a line on an archetype's tests to its test entries and test modules, never to its production files", () => {
    assert.deepEqual(
      cohesionOff(({ page }) => page.modules.tests),
      ['src/a/a.test.ts', 'src/a/a.driver.ts', 'src/a/b/b.fixture.ts'],
    );
  });

  it("apply a line on an ancestor's tests to every test below it", () => {
    assert.deepEqual(
      cohesionOff(({ site }) => site.modules.tests),
      ['src/a/a.test.ts', 'src/a/a.driver.ts', 'src/a/b/b.fixture.ts', 'e2e/flow.test.ts'],
    );
  });
});
