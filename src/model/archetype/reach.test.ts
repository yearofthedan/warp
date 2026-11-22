import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ExternalImport, ImportEdge, ModuleFacts } from '../facts.ts';
import { archetype, dir, pkg } from './builder.ts';
import { archetypeRules } from '../rules/index.ts';
import { noDoubleExport } from '../rules/no-double-export/noDoubleExport.ts';
import { unitExternals } from '../rules/unit-externals/unitExternals.ts';
import { checkModel } from './check.ts';
import type { ConfigData } from './data.ts';
import { loadConfigData } from './load.ts';
import { grantText, type Verdict, verdicts } from './reach.ts';

import { type Folders, type Model, resolveModel } from './resolve.ts';

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

const runner = archetype('runner')
  .contains((p) => p.files('contract', 'contract.ts').files('rest', '**', { using: (s) => [s.contract] }))
  .exposes((s) => ({ contract: s.contract, rest: s.rest }));

const card = archetype('card')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ runner, strings: dir() })
  .contains((p, { required, self }) =>
    p
      .dir('sub', '{name}', self)
      .files('logic', '*.ts', { using: [required.strings] })
      .files('dom', '{name}.dom.ts', { using: (s) => [s.logic, s.sub.render] })
      .files('page', '*.page.ts', { using: (s) => [s.dom, s.sub.page] })
      .files('test', '*.test.ts', { using: (s) => [s.logic, s.page, required.runner.contract, pkg('vitest')] }),
  )
  .exposes((s) => ({ render: s.dom, page: s.page }));

const ui = archetype('ui')
  .contains((p) =>
    p
      .dir('strings', 'strings')
      .dir('cards', '{name}', card)
      .files('shared', 'shared.ts', { using: (s) => [s.strings] }),
  )
  .provides((s) => ({ strings: s.strings }));

const app = archetype('app')
  .contains((p) =>
    p
      .dir('strings', 'src/strings')
      .dir('runner', 'src/runner', runner)
      .dir('domain', 'src/domain', { using: [pkg('node:*'), pkg('lodash.get')] })
      .dir('ui', 'src/ui', ui, { using: (s) => [s.domain] })
      .files('main', 'src/main.ts', { using: (s) => [s.ui] }),
  )
  .provides((s) => ({ runner: s.runner, strings: s.strings }));

const files = [
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
  const { config } = loadConfigData({ root: app });
  return { config, model: resolveModel(config, folders(files), files) };
};

const { config, model } = setup();
const judge = () => verdicts(config, model);
const unit = (id: string) => model.units.find((candidate) => candidate.id === id)!;

const verdict = (from: string, to: string): string | undefined => {
  const found: Verdict | undefined = judge().verdict(from, to);
  if (!found) return undefined;
  if (found.allowed) return `allowed: ${grantText(found.grant)}`;
  return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
};

describe('verdicts', () => {
  it("lets a file reach the rest of its own part, and refuses another part of its unit that its using doesn't list", () => {
    assert.equal(verdict('src/runner/driver.ts', 'src/runner/driver.ts'), 'allowed: own part rest');
    assert.equal(verdict('src/domain/order.ts', 'src/domain/price.ts'), 'allowed: own folder src/domain');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/a.ts'), 'allowed: dom uses s.logic');
    assert.equal(verdict('src/ui/a/a.ts', 'src/ui/a/a.dom.ts'), 'not-in-using');
    assert.equal(verdict('src/ui/a/a.ts', 'src/ui/a/b/b.dom.ts'), 'not-in-using');
  });

  it('reaches a child through what it exposes, and finds the unit that keeps a deeper file private', () => {
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/b.dom.ts'), 'allowed: dom uses s.sub.render');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/b.ts'), 'private to src/ui/a/b');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/c/c.dom.ts'), 'private to src/ui/a/b');
    assert.equal(verdict('src/ui/a/a.page.ts', 'src/ui/a/b/b.page.ts'), 'allowed: page uses s.sub.page');
    assert.equal(verdict('src/ui/a/a.page.ts', 'src/ui/a/b/c/c.page.ts'), 'private to src/ui/a/b');
  });

  it("refuses units of one dir part each other, and a file anywhere above the importer's unit", () => {
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/d/d.dom.ts'), 'not-in-using');
    assert.equal(verdict('src/ui/a/b/b.dom.ts', 'src/ui/d/d.dom.ts'), 'not-in-using');
    assert.equal(verdict('src/ui/a/b/b.dom.ts', 'src/ui/a/a.dom.ts'), 'above');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/shared.ts'), 'above');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/main.ts'), 'above');
    assert.equal(verdict('src/domain/order.ts', 'src/main.ts'), 'above');
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

  it("grants a dir part's using to its units' own files and to nothing nested in them", () => {
    assert.equal(verdict('src/ui/shared.ts', 'src/domain/order.ts'), 'allowed: app.ui uses s.domain');
    assert.equal(verdict('src/ui/a/a.ts', 'src/domain/order.ts'), 'not-in-using');
  });

  it('lets a part that names a unit with no .exposes() reach its own files and what its units expose', () => {
    assert.equal(verdict('src/main.ts', 'src/ui/shared.ts'), 'allowed: main uses s.ui');
    assert.equal(verdict('src/main.ts', 'src/ui/notes.md'), 'allowed: main uses s.ui');
    assert.equal(verdict('src/main.ts', 'src/ui/strings/en.ts'), 'allowed: main uses s.ui');
    assert.equal(verdict('src/main.ts', 'src/ui/a/a.dom.ts'), 'allowed: main uses s.ui');
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
        ['own part test', ['src/ui/a/a.test.ts']],
        ['test uses s.logic', ['src/ui/a/a.ts']],
        ['test uses s.page', ['src/ui/a/a.page.ts']],
        ['test uses required.runner.contract (from .)', ['src/runner/contract.ts']],
        ["test uses pkg('vitest')", []],
      ],
    );
    const once = judge();
    assert.equal(once.reach('src/ui/a/a.test.ts'), once.reach('src/ui/a/a.test.ts'));
    assert.notEqual(once.reach('src/ui/a/a.test.ts'), once.reach('src/ui/a/a.page.ts'));
    assert.deepEqual(judge().reach('src/ui/strings/en.ts')!.map(grantText), ['own folder src/ui/strings']);
    assert.deepEqual(judge().reach('src/ui/shared.ts')!.map(grantText), [
      'own part shared',
      'shared uses s.strings',
      'app.ui uses s.domain',
    ]);
  });

  it('gives each surface of a unit, or all of them', () => {
    assert.deepEqual([...judge().surface(unit('src/ui/a'), 'page')], ['src/ui/a/a.page.ts']);
    assert.deepEqual([...judge().surface(unit('src/ui/a'))].sort(), ['src/ui/a/a.dom.ts', 'src/ui/a/a.page.ts']);
    assert.deepEqual([...judge().surface(unit('src/ui/a'), 'nothing')], []);
    assert.deepEqual([...judge().surface(unit('src/domain'))], ['src/domain/order.ts', 'src/domain/price.ts']);
    const once = judge();
    assert.equal(once.surface(unit('src/ui/a')), once.surface(unit('src/ui/a')));
    assert.notEqual(once.surface(unit('src/ui/a')), once.surface(unit('src/ui/a'), 'page'));
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

const module = (file: string, imports: ImportEdge[], externals: ExternalImport[] = []): ModuleFacts => ({
  file,
  lines: 10,
  imports,
  externals,
  units: { units: [], links: [] },
  functions: [],
});

const documented = (docs: Record<string, string>) =>
  archetypeRules.map((rule) => (docs[rule.id] ? { ...rule, docs: docs[rule.id] } : rule));

describe('checkModel', () => {
  const check = (modules: ModuleFacts[], docs = {}) => checkModel(config, model, { modules }, documented(docs));

  it('reports one dependency-direction finding per file pair outside reach, valued by the names imported', () => {
    const findings = check([
      module('src/ui/a/a.ts', [
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
        value: 2,
        message:
          "src/ui/a/a.ts (logic of card src/ui/a) imports src/ui/a/a.dom.ts (dom of card src/ui/a), which is outside logic's reach: logic uses required.strings (from src/ui). Add what holds src/ui/a/a.dom.ts to a using if the dependency is intended, or move the code.",
        details: {
          from: { unit: 'src/ui/a', part: 'logic' },
          to: { unit: 'src/ui/a', part: 'dom' },
          reason: 'not-in-using',
          edges: [
            edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts', { names: ['render'], line: 3, typeOnly: true }),
            edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts', { names: ['render', 'mount'], line: 4 }),
          ],
        },
      },
    ]);
  });

  it('says which unit keeps a file private, and what it exposes instead', () => {
    const [finding] = check([
      module('src/main.ts', [edge('src/main.ts', 'src/ui/a/a.ts', { names: [], typeOnly: true })]),
    ]);
    assert.equal(finding?.value, 1);
    assert.equal(
      finding?.message,
      'src/main.ts (main of app .) imports types from src/ui/a/a.ts (logic of card src/ui/a), which src/ui/a keeps private (it exposes render, page). Import what src/ui/a exposes, or expose src/ui/a/a.ts from card if other units should reach it.',
    );
    assert.deepEqual(finding?.details, {
      from: { unit: '.', part: 'main' },
      to: { unit: 'src/ui/a', part: 'logic' },
      reason: 'private',
      hiddenBy: 'src/ui/a',
      edges: [edge('src/main.ts', 'src/ui/a/a.ts', { names: [], typeOnly: true })],
    });
  });

  it('tells a unit that reaches above itself to require what it needs', () => {
    const [domain, card] = check([
      module('src/domain/order.ts', [edge('src/domain/order.ts', 'src/main.ts')]),
      module('src/ui/a/a.dom.ts', [edge('src/ui/a/a.dom.ts', 'src/ui/shared.ts', { typeOnly: true })]),
    ]);
    assert.equal(
      domain?.message,
      'src/domain/order.ts (plain folder src/domain) imports src/main.ts (main of app .), which is above src/domain. A unit reaches up only through what it requires: require it in the archetype that finds it and have an ancestor provide it, or move it below.',
    );
    assert.equal(
      card?.message,
      'src/ui/a/a.dom.ts (dom of card src/ui/a) imports types from src/ui/shared.ts (shared of ui src/ui), which is above src/ui/a. A unit reaches up only through what it requires: require it in card and have an ancestor provide it, or move it below.',
    );
  });

  it('names every using that grants reach, by the part that holds it, or says there are none', () => {
    const [shared, test, runner] = check([
      module('src/ui/shared.ts', [edge('src/ui/shared.ts', 'src/runner/driver.ts')]),
      module('src/ui/a/a.test.ts', [edge('src/ui/a/a.test.ts', 'src/runner/driver.ts')]),
      module('src/runner/contract.ts', [edge('src/runner/contract.ts', 'src/runner/driver.ts')]),
    ]);
    assert.equal(
      shared!.message,
      "src/ui/shared.ts (shared of ui src/ui) imports src/runner/driver.ts (rest of runner src/runner), which is outside shared's reach: shared uses s.strings; app.ui uses s.domain. Add what holds src/runner/driver.ts to a using if the dependency is intended, or move the code.",
    );
    assert.match(
      test!.message,
      /reach: test uses s\.logic, s\.page, required\.runner\.contract \(from \.\), pkg\('vitest'\)\. Add/,
    );
    assert.match(runner!.message, /which is outside contract's reach, its own files only\. /);
  });

  it('places a loose target in its unit', () => {
    const [finding] = check([module('src/ui/a/a.ts', [edge('src/ui/a/a.ts', 'src/ui/notes.md')])]);
    assert.match(finding!.message, /imports src\/ui\/notes\.md \(loose in ui src\/ui\), which is above src\/ui\/a\./);
  });

  it('judges an import on the file its specifier names, so a barrel on a surface lets it through', () => {
    const findings = check([
      module('src/main.ts', [
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
        module('src/ui/notes.md', [edge('src/ui/notes.md', 'src/ui/a/a.ts')]),
        module('src/ui/a/a.ts', [edge('src/ui/a/a.ts', 'src/ui/a/a.ts'), edge('src/ui/a/a.ts', 'elsewhere.ts')]),
        module('src/ui/a/b/b.ts', [edge('src/ui/a/b/b.ts', 'src/ui/a/b/b.ts', { via: 'src/ui/a/b/b.dom.ts' })]),
      ]).map((finding) => finding.key),
      ['dependency-direction:src/ui/a/b/b.ts->src/ui/a/b/b.dom.ts'],
    );
  });

  it("attaches each rule's docs when given, and leaves the key out otherwise", () => {
    const imports = [module('src/ui/a/a.ts', [edge('src/ui/a/a.ts', 'src/ui/a/a.dom.ts')])];
    assert.equal(check(imports, { 'dependency-direction': 'https://docs' })[0]?.docs, 'https://docs');
    assert.ok(!('docs' in check(imports)[0]!));
  });

  it('reports each loose file where its unit denies them, and nothing where it allows or warns', () => {
    const quiet = archetype('quiet').contains((p) => p.files('src', '*.ts'));
    const warned = archetype('warned')
      .loose('warn')
      .contains((p) => p.files('src', '*.ts'));
    const denied = archetype('denied')
      .loose('deny')
      .contains((p) => p.files('src', '*.ts'));
    const root = archetype('app').contains((p) =>
      p.dir('quiet', 'quiet', quiet).dir('warned', 'warned', warned).dir('denied', 'denied', denied),
    );
    const paths = ['stray.ts', 'quiet/a.css', 'warned/b.css', 'denied/c.css', 'denied/d.ts'];
    const data = loadConfigData({ root }).config;
    const looseModel = resolveModel(data, folders(paths), paths);
    assert.deepEqual(checkModel(data, looseModel, { modules: [] }, [], 'https://docs'), [
      {
        rule: 'unclassified',
        key: 'unclassified:stray.ts',
        file: 'stray.ts',
        line: 1,
        value: 1,
        message:
          "stray.ts is in no part of . (app), so nothing says what it may import. Add a files part to app that matches it, or move it into a part's folder.",
        docs: 'https://docs',
      },
      {
        rule: 'unclassified',
        key: 'unclassified:denied/c.css',
        file: 'denied/c.css',
        line: 1,
        value: 1,
        message:
          "denied/c.css is in no part of denied (denied), so nothing says what it may import. Add a files part to denied that matches it, or move it into a part's folder.",
        docs: 'https://docs',
      },
    ]);
    assert.ok(!('docs' in checkModel(data, looseModel, { modules: [] })[0]!));
  });
});

describe('unit-externals', () => {
  const check = (modules: ModuleFacts[], docs = {}) =>
    checkModel(config, model, { modules }, documented(docs)).filter((finding) => finding.rule === 'unit-externals');
  const keys = (modules: ModuleFacts[]) => check(modules).map((finding) => finding.key);

  it('passes a package a using in reach lists, by name or by specifier, and its subpaths', () => {
    assert.deepEqual(
      keys([
        module(
          'src/ui/a/a.test.ts',
          [],
          [external('src/ui/a/a.test.ts', 'vitest'), external('src/ui/a/a.test.ts', 'vitest/config')],
        ),
        module(
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
    assert.deepEqual(check([module('src/ui/a/a.test.ts', [], [external('src/ui/a/a.test.ts', 'vitest'), ...edges])]), [
      {
        rule: 'unit-externals',
        key: 'unit-externals:src/ui/a/a.test.ts->react',
        file: 'src/ui/a/a.test.ts',
        line: 2,
        value: 2,
        message:
          "src/ui/a/a.test.ts (test of card src/ui/a) imports react, react/jsx-runtime, a package outside test's reach: test uses pkg('vitest'). Add pkg('react') to a using if the dependency is intended, or move the code.",
        details: { from: { unit: 'src/ui/a', part: 'test' }, package: 'react', edges },
      },
    ]);
  });

  it("grants a dir part's packages to its units' own files, and says when no using lists one", () => {
    const [logic, domain] = check([
      module('src/ui/a/a.ts', [], [external('src/ui/a/a.ts', 'node:fs', { names: [], typeOnly: true })]),
      module('src/domain/order.ts', [], [external('src/domain/order.ts', 'lodashxget')]),
    ]);
    assert.equal(
      logic?.message,
      "src/ui/a/a.ts (logic of card src/ui/a) imports types from node:fs, a package outside logic's reach: no using in its reach lists a package. Add pkg('node:fs') to a using if the dependency is intended, or move the code.",
    );
    assert.equal(logic?.value, 1);
    assert.match(
      domain!.message,
      /outside src\/domain's reach: app\.domain uses pkg\('node:\*'\), pkg\('lodash\.get'\)\./,
    );
  });

  it('reports only the imports of a package outside reach, naming each using that lists packages', () => {
    const leaf = archetype('leaf').contains((p) => p.files('src', '*.ts', { using: [pkg('vite-plus/*')] }));
    const root = archetype('root').contains((p) => p.dir('leaf', 'leaf', leaf, { using: [pkg('node:*')] }));
    const data = loadConfigData({ root }).config;
    const paths = ['leaf/a.ts'];
    const edges = [external('leaf/a.ts', 'vite-plus/test'), external('leaf/a.ts', 'vite-plus', { line: 2 })];
    const leafModel = resolveModel(data, folders(paths), paths);
    const [finding] = checkModel(data, leafModel, { modules: [module('leaf/a.ts', [], edges)] }, [unitExternals]);
    assert.deepEqual(finding?.details, {
      from: { unit: 'leaf', part: 'src' },
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
          modules: [module('src/ui/a/a.test.ts', [], [external('src/ui/a/a.test.ts', 'vitest')])],
        },
        [unitExternals],
      ),
      [],
    );
    assert.deepEqual(
      keys([
        module('src/ui/notes.md', [], [external('src/ui/notes.md', 'react')]),
        module('elsewhere.ts', [], [external('elsewhere.ts', 'react')]),
      ]),
      [],
    );
    const modules = [module('src/main.ts', [], [external('src/main.ts', 'react')])];
    assert.equal(check(modules, { 'unit-externals': 'https://docs' })[0]?.docs, 'https://docs');
    assert.ok(!('docs' in check(modules)[0]!));
  });
});

describe('no-double-export', () => {
  const check = (modules: ModuleFacts[], docs = {}) =>
    checkModel(config, model, { modules }, documented(docs)).filter((finding) => finding.rule === 'no-double-export');
  const reExport = (from: string, to: string, extra: Partial<ImportEdge> = {}) =>
    edge(from, to, { reExport: true, ...extra });

  it('reports a file on a surface that re-exports another file on it, one finding per pair', () => {
    const edges = [
      reExport('src/ui/a/a.page.ts', 'src/ui/a/a.dom.ts', { names: ['render'], line: 2 }),
      reExport('src/ui/a/a.page.ts', 'src/ui/a/a.dom.ts', { names: [], line: 3 }),
    ];
    assert.deepEqual(check([module('src/ui/a/a.page.ts', edges)]), [
      {
        rule: 'no-double-export',
        key: 'no-double-export:src/ui/a/a.page.ts->src/ui/a/a.dom.ts',
        file: 'src/ui/a/a.page.ts',
        line: 2,
        value: 1,
        message:
          'src/ui/a/a.page.ts (page of card src/ui/a) re-exports src/ui/a/a.dom.ts (dom of card src/ui/a), and src/ui/a exposes both, so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.',
        details: { unit: 'src/ui/a', to: { unit: 'src/ui/a', part: 'dom' }, edges },
      },
    ]);
  });

  it("counts a child's file the unit passes on, and judges the file the specifier names", () => {
    assert.deepEqual(
      check([
        module('src/ui/shared.ts', [reExport('src/ui/shared.ts', 'src/ui/a/a.dom.ts', { names: ['a', 'b'] })]),
        module('src/ui/a/a.page.ts', [
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
          modules: [
            module('src/ui/a/a.dom.ts', [
              reExport('src/ui/a/a.dom.ts', 'src/ui/a/a.ts'),
              reExport('src/ui/a/a.dom.ts', 'src/ui/a/a.dom.ts'),
              reExport('src/ui/a/a.dom.ts', 'src/ui/a/b/b.dom.ts'),
              reExport('src/ui/a/a.dom.ts', 'src/domain/order.ts'),
              edge('src/ui/a/a.dom.ts', 'src/ui/a/a.page.ts'),
            ]),
            module('src/ui/a/a.ts', [reExport('src/ui/a/a.ts', 'src/ui/a/a.dom.ts')]),
          ],
        },
        [noDoubleExport],
      ),
      [],
    );
    const outside = [module('elsewhere.ts', [reExport('elsewhere.ts', 'src/ui/a/a.dom.ts')])];
    assert.deepEqual(checkModel(config, model, { modules: outside }, [noDoubleExport]), []);
  });

  it('attaches docs when given', () => {
    const modules = [module('src/ui/a/a.page.ts', [reExport('src/ui/a/a.page.ts', 'src/ui/a/a.dom.ts')])];
    assert.equal(check(modules, { 'no-double-export': 'https://docs' })[0]?.docs, 'https://docs');
    assert.ok(!('docs' in check(modules)[0]!));
  });
});
