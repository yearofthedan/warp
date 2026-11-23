import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'vite-plus/test';
import type { ExternalImport, ImportEdge, FileFacts } from '../facts.ts';
import { all, archetype, dir, exposes, files, pkg, ruleset, using } from './builder.ts';
import { builtinRules } from '../../builtins/index.ts';
import { noDoubleExport } from '../../builtins/no-double-export/noDoubleExport.ts';
import { moduleExternals } from '../../builtins/module-externals/moduleExternals.ts';
import { checkModel } from '../../app/checkModel.ts';
import type { ConfigData } from './data.ts';
import { loadConfigData } from '../../app/load.ts';
import { grantText, type Verdict, verdicts } from './reach.ts';

import { type Folders, type Model, resolveModel } from './resolve.ts';

const importRules = builtinRules.filter((rule) => rule.id !== 'unused-declaration');

const folders = (paths: readonly string[]): Folders => {
  const dirs = new Set(
    paths.flatMap((path) =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, at, all) => all.slice(0, at + 1).join('/')),
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

const projectFiles = [
  'src/main.ts',
  'src/domain/order.ts',
  'src/domain/price.ts',
  'src/strings/root.ts',
  'src/runner/contract.ts',
  'src/runner/driver.ts',
  'src/ui/shared.ts',
  'src/ui/notes.md',
  'src/ui/strings/en.ts',
  'src/ui/a/a.dom.ts',
  'src/ui/a/a.ts',
  'src/ui/a/a.page.ts',
  'src/ui/a/a.test.ts',
  'src/ui/a/b/b.dom.ts',
  'src/ui/a/b/b.ts',
  'src/ui/a/b/b.page.ts',
  'src/ui/a/b/c/c.dom.ts',
  'src/ui/a/b/c/c.page.ts',
  'src/ui/d/d.dom.ts',
];

const setup = (): { config: ConfigData; model: Model } => {
  const runner = archetype('runner')
    .contains((m) =>
      m.module('contract', files('contract.ts'), exposes(all())).module(
        'rest',
        files('**'),
        exposes(all()).using((m) => [m.contract]),
      ),
    )
    .exposes((m) => ({ contract: m.contract, rest: m.rest }));

  const card = archetype('card')
    .identify({ marker: '{name}.dom.ts' })
    .requires({ runner, strings: dir() })
    .contains((m, { required, self }) =>
      m
        .module('sub', dir('{name}'), self)
        .module('logic', files('*.ts'), exposes(all()).using([required.strings]))
        .module(
          'dom',
          files('{name}.dom.ts'),
          exposes(all()).using((m) => [m.logic, m.sub.render]),
        )
        .module(
          'page',
          files('*.page.ts'),
          exposes(all()).using((m) => [m.dom, m.sub.page]),
        )
        .module(
          'test',
          files('*.test.ts'),
          using((m) => [m.logic, m.page, required.runner.contract, pkg('vitest')]),
        ),
    )
    .exposes((m) => ({ render: m.dom, page: m.page }));

  const ui = archetype('ui')
    .contains((m) =>
      m
        .module('strings', dir('strings'), exposes(all()))
        .module('cards', dir('{name}'), card)
        .module(
          'shared',
          files('shared.ts'),
          exposes(all()).using((m) => [m.strings]),
        ),
    )
    .provides((m) => ({ strings: m.strings }))
    .exposes(all());

  const app = archetype('app')
    .contains((m) =>
      m
        .module('strings', dir('src/strings'), exposes(all()))
        .module('runner', dir('src/runner'), runner)
        .module('domain', dir('src/domain'), exposes(all()).using([pkg('node:*'), pkg('lodash.get')]))
        .module(
          'ui',
          dir('src/ui'),
          ui.using((m) => [m.domain]),
        )
        .module(
          'main',
          files('src/main.ts'),
          using((m) => [m.ui]),
        ),
    )
    .provides((m) => ({ runner: m.runner, strings: m.strings }));

  const { config } = loadConfigData({ root: app });
  return { config, model: resolveModel(config, folders(projectFiles), projectFiles) };
};

let config: ConfigData;
let model: Model;
beforeEach(() => {
  ({ config, model } = setup());
});
const judge = () => verdicts(config, model);
const module = (id: string) => model.modules.find((candidate) => candidate.id === id)!;

const verdict = (from: string, to: string): string | undefined => {
  const found: Verdict | undefined = judge().verdict(from, to);
  if (!found) return undefined;
  if (found.allowed) return `allowed: ${grantText(found.grant)}`;
  return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
};

describe('verdicts', () => {
  it("lets a file reach the rest of its own module, and refuses a sibling module its using doesn't list", () => {
    assert.equal(verdict('src/runner/driver.ts', 'src/runner/driver.ts'), 'allowed: own module src/runner:rest');
    assert.equal(verdict('src/domain/order.ts', 'src/domain/price.ts'), 'allowed: own module src/domain');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/a.ts'), 'allowed: dom uses m.logic');
    assert.equal(verdict('src/ui/a/a.ts', 'src/ui/a/a.dom.ts'), 'not-in-using');
    assert.equal(verdict('src/ui/a/a.ts', 'src/ui/a/b/b.dom.ts'), 'not-in-using');
  });

  it('reaches a child through what it exposes, and finds the module that keeps a deeper file private', () => {
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/b.dom.ts'), 'allowed: dom uses m.sub.render');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/b.ts'), 'private to src/ui/a/b');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/c/c.dom.ts'), 'private to src/ui/a/b');
    assert.equal(verdict('src/ui/a/a.page.ts', 'src/ui/a/b/b.page.ts'), 'allowed: page uses m.sub.page');
    assert.equal(verdict('src/ui/a/a.page.ts', 'src/ui/a/b/c/c.page.ts'), 'private to src/ui/a/b');
  });

  it("refuses modules of one dir module each other, and a file anywhere above the importer's module", () => {
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/d/d.dom.ts'), 'not-in-using');
    assert.equal(verdict('src/ui/a/b/b.dom.ts', 'src/ui/d/d.dom.ts'), 'not-in-using');
    assert.equal(verdict('src/ui/a/b/b.dom.ts', 'src/ui/a/a.dom.ts'), 'above');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/shared.ts'), 'above');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/main.ts'), 'above');
    assert.equal(verdict('src/domain/order.ts', 'src/main.ts'), 'private to .:main');
  });

  it('answers a requirement from the nearest provider above, whole or by one surface', () => {
    assert.equal(
      verdict('src/ui/a/a.ts', 'src/ui/strings/en.ts'),
      'allowed: logic uses required.strings (from src/ui)',
    );
    assert.equal(
      verdict('src/ui/a/b/b.ts', 'src/ui/strings/en.ts'),
      'allowed: logic uses required.strings (from src/ui)',
    );
    assert.equal(verdict('src/ui/a/a.ts', 'src/strings/root.ts'), 'not-in-using');
    assert.equal(
      verdict('src/ui/a/a.test.ts', 'src/runner/contract.ts'),
      'allowed: test uses required.runner.contract (from .)',
    );
    assert.equal(verdict('src/ui/a/a.test.ts', 'src/runner/driver.ts'), 'not-in-using');
  });

  it("grants a dir module's using to its folder's files and files modules, and to nothing nested in folders below", () => {
    assert.equal(verdict('src/ui/shared.ts', 'src/domain/order.ts'), 'allowed: app.ui uses m.domain');
    assert.equal(verdict('src/ui/a/a.ts', 'src/domain/order.ts'), 'not-in-using');
  });

  it("lets a module that names one exposing 'all' reach its own files and what its modules expose", () => {
    assert.equal(verdict('src/main.ts', 'src/ui/shared.ts'), 'allowed: main uses m.ui');
    assert.equal(verdict('src/main.ts', 'src/ui/notes.md'), 'allowed: main uses m.ui');
    assert.equal(verdict('src/main.ts', 'src/ui/strings/en.ts'), 'allowed: main uses m.ui');
    assert.equal(verdict('src/main.ts', 'src/ui/a/a.dom.ts'), 'allowed: main uses m.ui');
    assert.equal(verdict('src/main.ts', 'src/ui/a/a.ts'), 'private to src/ui/a');
    assert.equal(verdict('src/main.ts', 'src/ui/a/b/b.dom.ts'), 'private to src/ui/a');
  });

  it('judges nothing from a loose file, or to a file outside the model', () => {
    assert.equal(judge().verdict('src/ui/notes.md', 'src/ui/shared.ts'), undefined);
    assert.equal(judge().reach('src/ui/notes.md'), undefined);
    assert.equal(judge().verdict('src/main.ts', 'elsewhere.ts'), undefined);
    assert.equal(judge().verdict('elsewhere.ts', 'src/main.ts'), undefined);
    assert.equal(judge().reach('elsewhere.ts'), undefined);
  });

  it("lists each source of a file's reach, packages naming no files", () => {
    assert.deepEqual(
      judge()
        .reach('src/ui/a/a.test.ts')!
        .map((grant) => [grantText(grant), [...grant.files]]),
      [
        ['own module src/ui/a:test', ['src/ui/a/a.test.ts']],
        ['test uses m.logic', ['src/ui/a/a.ts']],
        ['test uses m.page', ['src/ui/a/a.page.ts']],
        ['test uses required.runner.contract (from .)', ['src/runner/contract.ts']],
        ["test uses pkg('vitest')", []],
      ],
    );
    const once = judge();
    assert.equal(once.reach('src/ui/a/a.test.ts'), once.reach('src/ui/a/a.test.ts'));
    assert.notEqual(once.reach('src/ui/a/a.test.ts'), once.reach('src/ui/a/a.page.ts'));
    assert.deepEqual(judge().reach('src/ui/strings/en.ts')!.map(grantText), ['own module src/ui/strings']);
    assert.deepEqual(judge().reach('src/ui/shared.ts')!.map(grantText), [
      'own module src/ui:shared',
      'shared uses m.strings',
      'app.ui uses m.domain',
    ]);
  });

  it('gives each surface of a module, or all of them', () => {
    assert.deepEqual([...judge().surface(module('src/ui/a'), 'page')], ['src/ui/a/a.page.ts']);
    assert.deepEqual([...judge().surface(module('src/ui/a'))].sort(), ['src/ui/a/a.dom.ts', 'src/ui/a/a.page.ts']);
    assert.deepEqual([...judge().surface(module('src/ui/a'), 'nothing')], []);
    assert.deepEqual([...judge().surface(module('src/domain'))], ['src/domain/order.ts', 'src/domain/price.ts']);
    const once = judge();
    assert.equal(once.surface(module('src/ui/a')), once.surface(module('src/ui/a')));
    assert.notEqual(once.surface(module('src/ui/a')), once.surface(module('src/ui/a'), 'page'));
  });
});

describe('exposes', () => {
  const shopFixture = () => {
    const widget = archetype('widget')
      .contains((m) => m.module('api', files('api.ts'), exposes(all())).module('internals', files('*.ts')))
      .exposes(all());
    const shop = archetype('shop').contains((m) =>
      m
        .module('app', dir('app'), exposes(files('check.ts', 'ports/*.ts')))
        .module('widgets', dir('widgets/{name}'), widget)
        .module('quiet', files('quiet.ts'))
        .module(
          'main',
          files('main.ts'),
          using((m) => [m.app, m.widgets]),
        ),
    );
    const paths = [
      'main.ts',
      'quiet.ts',
      'app/check.ts',
      'app/run.ts',
      'app/ports/store.ts',
      'app/ports/deep/x.ts',
      'widgets/a/api.ts',
      'widgets/a/util.ts',
      'widgets/a/readme.md',
    ];
    const data = loadConfigData({ root: shop }).config;
    const shopModel = resolveModel(data, folders(paths), paths);
    const shopVerdict = (from: string, to: string) => {
      const found = verdicts(data, shopModel).verdict(from, to)!;
      if (found.allowed) return `allowed: ${grantText(found.grant)}`;
      return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
    };
    return { data, shopModel, shopVerdict };
  };

  it("opens the files a files() selector names, inside the module's folder", () => {
    const { shopVerdict } = shopFixture();
    assert.equal(shopVerdict('main.ts', 'app/check.ts'), 'allowed: main uses m.app');
    assert.equal(shopVerdict('main.ts', 'app/ports/store.ts'), 'allowed: main uses m.app');
    assert.equal(shopVerdict('main.ts', 'app/run.ts'), 'private to app');
    assert.equal(shopVerdict('main.ts', 'app/ports/deep/x.ts'), 'private to app');
  });

  it("opens a module's own files and each child's surface with 'all', never a child's private files", () => {
    const { shopVerdict } = shopFixture();
    assert.equal(shopVerdict('main.ts', 'widgets/a/api.ts'), 'allowed: main uses m.widgets');
    assert.equal(shopVerdict('main.ts', 'widgets/a/readme.md'), 'allowed: main uses m.widgets');
    assert.equal(shopVerdict('main.ts', 'widgets/a/util.ts'), 'private to widgets/a:internals');
  });

  it('keeps a module that says nothing closed', () => {
    const { data, shopModel, shopVerdict } = shopFixture();
    assert.equal(shopVerdict('main.ts', 'quiet.ts'), 'private to .:quiet');
    assert.deepEqual([...verdicts(data, shopModel).surface(shopModel.moduleOf('quiet.ts')!)], []);
  });
});

const edge = (from: string, to: string, extra: Partial<ImportEdge> = {}): ImportEdge => ({
  from,
  to,
  specifier: `./${to}`,
  names: ['x'],
  typeOnly: false,
  line: 1,
  ...extra,
});

const external = (from: string, specifier: string, extra: Partial<ExternalImport> = {}): ExternalImport => ({
  from,
  package: specifier.split('/')[0]!,
  specifier,
  names: ['x'],
  typeOnly: false,
  line: 1,
  ...extra,
});

const facts = (path: string, imports: ImportEdge[], externals: ExternalImport[] = []): FileFacts => ({
  path,
  lines: 10,
  imports,
  externals,
  members: { members: [], links: [] },
  functions: [],
});

const documented = (docs: Record<string, string>) =>
  importRules.map((rule) => (docs[rule.id] ? { ...rule, docs: docs[rule.id] } : rule));

describe('checkModel', () => {
  const check = (files: FileFacts[], docs = {}) => checkModel(config, model, { files }, documented(docs));

  it('reports one dependency-direction finding per file pair outside reach, valued by the names imported', () => {
    const findings = check([
      facts('src/ui/a/a.ts', [
        edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts', { names: ['render'], line: 3, typeOnly: true }),
        edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts', { names: ['render', 'mount'], line: 4 }),
        edge('src/ui/a/a.ts', 'src/ui/strings/en.ts'),
      ]),
    ]);
    assert.deepEqual(findings, [
      {
        rule: 'dependency-direction',
        key: 'dependency-direction:src/ui/a/a.ts->src/ui/a/a.dom.ts',
        file: 'src/ui/a/a.ts',
        line: 3,
        module: 'src/ui/a:logic',
        value: 2,
        message:
          "src/ui/a/a.ts (logic of card src/ui/a) imports src/ui/a/a.dom.ts (dom of card src/ui/a), which is outside logic's reach: logic uses required.strings (from src/ui). Add what holds src/ui/a/a.dom.ts to a using if the dependency is intended, or move the code.",
        details: {
          from: 'src/ui/a:logic',
          to: 'src/ui/a:dom',
          reason: 'not-in-using',
          edges: [
            edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts', { names: ['render'], line: 3, typeOnly: true }),
            edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts', { names: ['render', 'mount'], line: 4 }),
          ],
        },
      },
    ]);
  });

  it('says which module keeps a file private, and what it exposes instead', () => {
    const [finding] = check([
      facts('src/main.ts', [edge('src/main.ts', 'src/ui/a/a.ts', { names: [], typeOnly: true })]),
    ]);
    assert.equal(finding?.value, 1);
    assert.equal(
      finding?.message,
      'src/main.ts (main of app .) imports types from src/ui/a/a.ts (logic of card src/ui/a), which src/ui/a keeps private (it exposes render, page). Import what src/ui/a exposes, or expose src/ui/a/a.ts from card if other modules should reach it.',
    );
    assert.deepEqual(finding?.details, {
      from: '.:main',
      to: 'src/ui/a:logic',
      reason: 'private',
      hiddenBy: 'src/ui/a',
      edges: [edge('src/main.ts', 'src/ui/a/a.ts', { names: [], typeOnly: true })],
    });
  });

  it('tells a module that reaches above itself to require what it needs, and one that reaches a sibling that it keeps it private', () => {
    const [domain, card] = check([
      facts('src/domain/order.ts', [edge('src/domain/order.ts', 'src/main.ts')]),
      facts('src/ui/a/a.dom.ts', [edge('src/ui/a/a.dom.ts', 'src/ui/shared.ts', { typeOnly: true })]),
    ]);
    assert.equal(
      domain?.message,
      'src/domain/order.ts (app.domain src/domain) imports src/main.ts (main of app .), which .:main keeps private (it exposes nothing). Import what .:main exposes, or expose src/main.ts from main if other modules should reach it.',
    );
    assert.equal(
      card?.message,
      'src/ui/a/a.dom.ts (dom of card src/ui/a) imports types from src/ui/shared.ts (shared of ui src/ui), which is above src/ui/a. A module reaches up only through what it requires: require it in card and have an ancestor provide it, or move it below.',
    );
  });

  it('names every using that grants reach, by the module that holds it, or says there are none', () => {
    const [shared, test, runner] = check([
      facts('src/ui/shared.ts', [edge('src/ui/shared.ts', 'src/runner/driver.ts')]),
      facts('src/ui/a/a.test.ts', [edge('src/ui/a/a.test.ts', 'src/runner/driver.ts')]),
      facts('src/runner/contract.ts', [edge('src/runner/contract.ts', 'src/runner/driver.ts')]),
    ]);
    assert.equal(
      shared!.message,
      "src/ui/shared.ts (shared of ui src/ui) imports src/runner/driver.ts (rest of runner src/runner), which is outside shared's reach: shared uses m.strings; app.ui uses m.domain. Add what holds src/runner/driver.ts to a using if the dependency is intended, or move the code.",
    );
    assert.match(
      test!.message,
      /reach: test uses m\.logic, m\.page, required\.runner\.contract \(from \.\), pkg\('vitest'\)\. Add/,
    );
    assert.match(runner!.message, /which is outside contract's reach: contract may use nothing\. /);
  });

  it('says a loose target is in no module yet, so the fix is giving it one', () => {
    const [finding] = check([facts('src/ui/a/a.ts', [edge('src/ui/a/a.ts', 'src/ui/notes.md')])]);
    assert.equal(
      finding!.message,
      'src/ui/a/a.ts (logic of card src/ui/a) imports src/ui/notes.md (loose in ui src/ui), which is in no module yet. Add a module that holds src/ui/notes.md, then add it to a using if the dependency is intended.',
    );
    assert.equal((finding!.details as { reason: string }).reason, 'loose');
  });

  it('judges an import on the file its specifier names, so a barrel on a surface lets it through', () => {
    const findings = check([
      facts('src/main.ts', [
        edge('src/main.ts', 'src/ui/a/a.ts', { via: 'src/ui/a/a.dom.ts' }),
        edge('src/main.ts', 'src/ui/a/b/b.dom.ts', { via: 'src/ui/a/b/b.ts' }),
      ]),
    ]);
    assert.deepEqual(
      findings.map((finding) => finding.key),
      ['dependency-direction:src/main.ts->src/ui/a/b/b.ts'],
    );
  });

  it("skips a loose file's imports, a file's imports of its own part, and files outside the model", () => {
    assert.deepEqual(
      check([
        facts('src/ui/notes.md', [edge('src/ui/notes.md', 'src/ui/a/a.ts')]),
        facts('src/ui/a/a.ts', [edge('src/ui/a/a.ts', 'src/ui/a/a.ts'), edge('src/ui/a/a.ts', 'elsewhere.ts')]),
        facts('src/ui/a/b/b.ts', [edge('src/ui/a/b/b.ts', 'src/ui/a/b/b.ts', { via: 'src/ui/a/b/b.dom.ts' })]),
      ]).map((finding) => finding.key),
      ['dependency-direction:src/ui/a/b/b.ts->src/ui/a/b/b.dom.ts'],
    );
  });

  it("attaches each rule's docs when given, and leaves the key out otherwise", () => {
    const imports = [facts('src/ui/a/a.ts', [edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts')])];
    assert.equal(check(imports, { 'dependency-direction': 'https://docs' })[0]?.docs, 'https://docs');
    assert.ok(!('docs' in check(imports)[0]!));
  });

  it('reports loose files on the root and where a ruleset turns unclassified on, and nowhere else', () => {
    const quiet = archetype('quiet').contains((m) => m.module('src', files('*.ts')));
    const denied = archetype('denied').contains((m) => m.module('src', files('*.ts')));
    const root = archetype('app').contains((m) =>
      m.module('quiet', dir('quiet'), quiet).module('denied', dir('denied'), denied),
    );
    const base = ruleset().on(denied, { unclassified: true });
    const paths = ['stray.ts', 'quiet/a.css', 'denied/c.css', 'denied/d.ts'];
    const data = loadConfigData({ root, rulesets: { default: base } }, { ruleset: 'default' }).config;
    const looseModel = resolveModel(data, folders(paths), paths);
    assert.deepEqual(checkModel(data, looseModel, { files: [] }, [], 'https://docs'), [
      {
        rule: 'unclassified',
        key: 'unclassified:stray.ts',
        file: 'stray.ts',
        line: 1,
        module: '.',
        value: 1,
        message:
          "stray.ts is in no module of . (app), so nothing says what it may import. Add a files module to app that matches it, or move it into a module's folder.",
        docs: 'https://docs',
      },
      {
        rule: 'unclassified',
        key: 'unclassified:denied/c.css',
        file: 'denied/c.css',
        line: 1,
        module: 'denied',
        value: 1,
        message:
          "denied/c.css is in no module of denied (denied), so nothing says what it may import. Add a files module to denied that matches it, or move it into a module's folder.",
        docs: 'https://docs',
      },
    ]);
    assert.ok(!('docs' in checkModel(data, looseModel, { files: [] })[0]!));
  });

  it("turns unclassified off for a module and the modules below it from the module's archetype", () => {
    const leaf = archetype('leaf').contains((m) => m.module('src', files('*.ts')));
    const root = archetype('app').contains((m) => m.module('leaf', dir('leaf'), leaf));
    const everywhere = ruleset().rules({ unclassified: true }).on(root, { unclassified: false });
    const paths = ['stray.ts', 'leaf/a.css'];
    const data = loadConfigData({ root, rulesets: { default: everywhere } }, { ruleset: 'default' }).config;
    assert.deepEqual(checkModel(data, resolveModel(data, folders(paths), paths), { files: [] }), []);
  });
});

describe('module-externals', () => {
  const check = (files: FileFacts[], docs = {}) =>
    checkModel(config, model, { files }, documented(docs)).filter((finding) => finding.rule === 'module-externals');
  const keys = (files: FileFacts[]) => check(files).map((finding) => finding.key);

  it('passes a package a using in reach lists, by name or by specifier, and its subpaths', () => {
    assert.deepEqual(
      keys([
        facts(
          'src/ui/a/a.test.ts',
          [],
          [external('src/ui/a/a.test.ts', 'vitest'), external('src/ui/a/a.test.ts', 'vitest/config')],
        ),
        facts(
          'src/domain/order.ts',
          [],
          [
            external('src/domain/order.ts', 'node:fs/promises', { package: 'node:fs' }),
            external('src/domain/order.ts', 'lodash.get'),
          ],
        ),
      ]),
      [],
    );
  });

  it('reports one finding per file and package outside reach, valued by the names imported', () => {
    const edges = [
      external('src/ui/a/a.test.ts', 'react', { names: ['useState'], line: 2, typeOnly: true }),
      external('src/ui/a/a.test.ts', 'react/jsx-runtime', { package: 'react', names: ['jsx', 'useState'], line: 3 }),
    ];
    assert.deepEqual(check([facts('src/ui/a/a.test.ts', [], [external('src/ui/a/a.test.ts', 'vitest'), ...edges])]), [
      {
        rule: 'module-externals',
        key: 'module-externals:src/ui/a/a.test.ts->react',
        file: 'src/ui/a/a.test.ts',
        line: 2,
        module: 'src/ui/a:test',
        value: 2,
        message:
          "src/ui/a/a.test.ts (test of card src/ui/a) imports react, react/jsx-runtime, a package outside test's reach: test uses pkg('vitest'). Add pkg('react') to a using if the dependency is intended, or move the code.",
        details: { from: 'src/ui/a:test', package: 'react', edges },
      },
    ]);
  });

  it("grants a dir module's packages to its files, and says when no using lists one", () => {
    const [logic, domain] = check([
      facts('src/ui/a/a.ts', [], [external('src/ui/a/a.ts', 'node:fs', { names: [], typeOnly: true })]),
      facts('src/domain/order.ts', [], [external('src/domain/order.ts', 'lodashxget')]),
    ]);
    assert.equal(
      logic?.message,
      "src/ui/a/a.ts (logic of card src/ui/a) imports types from node:fs, a package outside logic's reach: no using in its reach lists a package. Add pkg('node:fs') to a using if the dependency is intended, or move the code.",
    );
    assert.equal(logic?.value, 1);
    assert.match(domain!.message, /outside domain's reach: app\.domain uses pkg\('node:\*'\), pkg\('lodash\.get'\)\./);
  });

  it('reports only the imports of a package outside reach, naming each using that lists packages', () => {
    const leaf = archetype('leaf').contains((m) => m.module('src', files('*.ts'), using([pkg('vite-plus/*')])));
    const root = archetype('root').contains((m) => m.module('leaf', dir('leaf'), leaf.using([pkg('node:*')])));
    const data = loadConfigData({ root }).config;
    const paths = ['leaf/a.ts'];
    const edges = [external('leaf/a.ts', 'vite-plus/test'), external('leaf/a.ts', 'vite-plus', { line: 2 })];
    const leafModel = resolveModel(data, folders(paths), paths);
    const [finding] = checkModel(data, leafModel, { files: [facts('leaf/a.ts', [], edges)] }, [moduleExternals]);
    assert.deepEqual(finding?.details, {
      from: 'leaf:src',
      package: 'vite-plus',
      edges: [edges[1]],
    });
    assert.match(finding!.message, /reach: src uses pkg\('vite-plus\/\*'\); root\.leaf uses pkg\('node:\*'\)\. Add/);
  });

  it('judges nothing from a loose file or a file outside the model, and attaches docs when given', () => {
    assert.deepEqual(
      checkModel(
        config,
        model,
        {
          files: [facts('src/ui/a/a.test.ts', [], [external('src/ui/a/a.test.ts', 'vitest')])],
        },
        [moduleExternals],
      ),
      [],
    );
    assert.deepEqual(
      keys([
        facts('src/ui/notes.md', [], [external('src/ui/notes.md', 'react')]),
        facts('elsewhere.ts', [], [external('elsewhere.ts', 'react')]),
      ]),
      [],
    );
    const files = [facts('src/main.ts', [], [external('src/main.ts', 'react')])];
    assert.equal(check(files, { 'module-externals': 'https://docs' })[0]?.docs, 'https://docs');
    assert.ok(!('docs' in check(files)[0]!));
  });
});

describe('no-double-export', () => {
  const check = (files: FileFacts[], docs = {}) =>
    checkModel(config, model, { files }, documented(docs)).filter((finding) => finding.rule === 'no-double-export');
  const reExport = (from: string, to: string, extra: Partial<ImportEdge> = {}) =>
    edge(from, to, { reExport: true, ...extra });

  it('reports a file on a surface that re-exports another file on it, one finding per pair', () => {
    const edges = [
      reExport('src/ui/a/a.page.ts', 'src/ui/a/a.dom.ts', { names: ['render'], line: 2 }),
      reExport('src/ui/a/a.page.ts', 'src/ui/a/a.dom.ts', { names: [], line: 3 }),
    ];
    assert.deepEqual(check([facts('src/ui/a/a.page.ts', edges)]), [
      {
        rule: 'no-double-export',
        key: 'no-double-export:src/ui/a/a.page.ts->src/ui/a/a.dom.ts',
        file: 'src/ui/a/a.page.ts',
        line: 2,
        module: 'src/ui/a:page',
        value: 1,
        message:
          'src/ui/a/a.page.ts (page of card src/ui/a) re-exports src/ui/a/a.dom.ts (dom of card src/ui/a), and src/ui/a exposes both, so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.',
        details: { module: 'src/ui/a', to: 'src/ui/a:dom', edges },
      },
    ]);
  });

  it("counts a child's file the module passes on, and judges the file the specifier names", () => {
    assert.deepEqual(
      check([
        facts('src/ui/shared.ts', [reExport('src/ui/shared.ts', 'src/ui/a/a.dom.ts', { names: ['a', 'b'] })]),
        facts('src/ui/a/a.page.ts', [
          reExport('src/ui/a/a.page.ts', 'src/ui/a/a.ts', { via: 'src/ui/a/a.dom.ts' }),
          reExport('src/ui/a/a.page.ts', 'src/ui/a/a.dom.ts', { via: 'src/ui/a/a.ts' }),
        ]),
      ]).map((finding) => [finding.key, finding.value]),
      [
        ['no-double-export:src/ui/shared.ts->src/ui/a/a.dom.ts', 2],
        ['no-double-export:src/ui/a/a.page.ts->src/ui/a/a.dom.ts', 1],
      ],
    );
  });

  it("passes a barrel over private files, plain imports, files off the surface, and a child's file kept back", () => {
    assert.deepEqual(
      checkModel(
        config,
        model,
        {
          files: [
            facts('src/ui/a/a.dom.ts', [
              reExport('src/ui/a/a.dom.ts', 'src/ui/a/a.ts'),
              reExport('src/ui/a/a.dom.ts', 'src/ui/a/a.dom.ts'),
              reExport('src/ui/a/a.dom.ts', 'src/ui/a/b/b.dom.ts'),
              reExport('src/ui/a/a.dom.ts', 'src/domain/order.ts'),
              edge('src/ui/a/a.dom.ts', 'src/ui/a/a.page.ts'),
            ]),
            facts('src/ui/a/a.ts', [reExport('src/ui/a/a.ts', 'src/ui/a/a.dom.ts')]),
          ],
        },
        [noDoubleExport],
      ),
      [],
    );
    const outside = [facts('elsewhere.ts', [reExport('elsewhere.ts', 'src/ui/a/a.dom.ts')])];
    assert.deepEqual(checkModel(config, model, { files: outside }, [noDoubleExport]), []);
  });

  it('attaches docs when given', () => {
    const files = [facts('src/ui/a/a.page.ts', [reExport('src/ui/a/a.page.ts', 'src/ui/a/a.dom.ts')])];
    assert.equal(check(files, { 'no-double-export': 'https://docs' })[0]?.docs, 'https://docs');
    assert.ok(!('docs' in check(files)[0]!));
  });
});
