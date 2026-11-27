import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import type { ExternalImport, ImportEdge, FileFacts } from '../facts/facts.ts';
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

const recommended = `
rulesets:
  default:
    extends: [warp:recommended]
`;

const load = (yaml: string): ConfigData => loadConfigData(parse(`${yaml}${recommended}`)).config;

const structure = `
root:
  modules:
    strings: { dir: src/strings, exposes: all }
    runner: { dir: src/runner, archetype: runner }
    domain: { dir: src/domain, exposes: all, dependencies: ['node:*', npm:lodash.get] }
    ui: { dir: src/ui, archetype: ui, dependencies: [runner, domain] }
    main: { files: src/main.ts, dependencies: [ui] }
archetypes:
  runner:
    exposes: [contract, rest]
    modules:
      contract: { files: contract.ts, exposes: all }
      rest: { files: '**', exposes: all, dependencies: [contract] }
  card:
    marker: '{name}.dom.ts'
    requires: [runner, strings]
    exposes: [render, page]
    modules:
      sub: { dir: '*', archetype: card, dependencies: [runner, strings] }
      logic: { files: '*.ts', exposes: all, dependencies: [strings] }
      render: { files: '{name}.dom.ts', exposes: all, dependencies: [logic, sub.render] }
      page: { files: '*.page.ts', exposes: all, dependencies: [render, sub.page] }
      spec: { files: '*.test.ts', dependencies: [logic, page, runner.contract, npm:vitest] }
  ui:
    requires: [runner, domain]
    exposes: all
    modules:
      strings: { dir: strings, exposes: all }
      cards: { dir: '*', archetype: card, dependencies: [runner, strings] }
      shared: { files: shared.ts, exposes: all, dependencies: [strings, domain] }
`;

const setup = (): { config: ConfigData; model: Model } => {
  const config = load(structure);
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
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/a.ts'), 'allowed: render uses logic');
    assert.equal(verdict('src/ui/a/a.ts', 'src/ui/a/a.dom.ts'), 'not-in-dependencies');
    assert.equal(verdict('src/ui/a/a.ts', 'src/ui/a/b/b.dom.ts'), 'not-in-dependencies');
  });

  it('reaches a child through what it exposes, and finds the module that keeps a deeper file private', () => {
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/b.dom.ts'), 'allowed: render uses sub.render');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/b.ts'), 'private to src/ui/a/b');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/a/b/c/c.dom.ts'), 'private to src/ui/a/b');
    assert.equal(verdict('src/ui/a/a.page.ts', 'src/ui/a/b/b.page.ts'), 'allowed: page uses sub.page');
    assert.equal(verdict('src/ui/a/a.page.ts', 'src/ui/a/b/c/c.page.ts'), 'private to src/ui/a/b');
  });

  it("refuses modules of one dir module each other, and a file anywhere above the importer's module", () => {
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/d/d.dom.ts'), 'not-in-dependencies');
    assert.equal(verdict('src/ui/a/b/b.dom.ts', 'src/ui/d/d.dom.ts'), 'not-in-dependencies');
    assert.equal(verdict('src/ui/a/b/b.dom.ts', 'src/ui/a/a.dom.ts'), 'above');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/ui/shared.ts'), 'above');
    assert.equal(verdict('src/ui/a/a.dom.ts', 'src/main.ts'), 'above');
    assert.equal(verdict('src/domain/order.ts', 'src/main.ts'), 'private to (root):main');
  });

  it('answers a requirement from the nearest provider above, whole or by one surface', () => {
    assert.equal(
      verdict('src/ui/a/a.ts', 'src/ui/strings/en.ts'),
      'allowed: logic uses strings (input of src/ui/a = strings in src/ui)',
    );
    assert.equal(
      verdict('src/ui/a/b/b.ts', 'src/ui/strings/en.ts'),
      'allowed: logic uses strings (input of src/ui/a/b = strings in src/ui)',
    );
    assert.equal(verdict('src/ui/a/a.ts', 'src/strings/root.ts'), 'not-in-dependencies');
    assert.equal(
      verdict('src/ui/a/a.test.ts', 'src/runner/contract.ts'),
      'allowed: spec uses runner.contract (input of src/ui/a = runner.contract in (root))',
    );
    assert.equal(verdict('src/ui/a/a.test.ts', 'src/runner/driver.ts'), 'not-in-dependencies');
  });

  it("grants a dir module's using to its folder's files and files modules, and to nothing nested in folders below", () => {
    assert.equal(
      verdict('src/ui/shared.ts', 'src/domain/order.ts'),
      'allowed: shared uses domain (input of src/ui = domain in (root))',
    );
    assert.equal(verdict('src/ui/a/a.ts', 'src/domain/order.ts'), 'not-in-dependencies');
  });

  it("lets a module that names one exposing 'all' reach its own files and what its modules expose", () => {
    assert.equal(verdict('src/main.ts', 'src/ui/shared.ts'), 'allowed: main uses ui');
    assert.equal(verdict('src/main.ts', 'src/ui/notes.md'), 'allowed: main uses ui');
    assert.equal(verdict('src/main.ts', 'src/ui/strings/en.ts'), 'allowed: main uses ui');
    assert.equal(verdict('src/main.ts', 'src/ui/a/a.dom.ts'), 'allowed: main uses ui');
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
        ['own module src/ui/a:spec', ['src/ui/a/a.test.ts']],
        ['spec uses logic', ['src/ui/a/a.ts']],
        ['spec uses page', ['src/ui/a/a.page.ts']],
        ['spec uses runner.contract (input of src/ui/a = runner.contract in (root))', ['src/runner/contract.ts']],
        ['spec uses npm:vitest', []],
      ],
    );
    const once = judge();
    assert.equal(once.reach('src/ui/a/a.test.ts'), once.reach('src/ui/a/a.test.ts'));
    assert.notEqual(once.reach('src/ui/a/a.test.ts'), once.reach('src/ui/a/a.page.ts'));
    assert.deepEqual(judge().reach('src/ui/strings/en.ts')!.map(grantText), ['own module src/ui/strings']);
    assert.deepEqual(judge().reach('src/ui/shared.ts')!.map(grantText), [
      'own module src/ui:shared',
      'shared uses strings',
      'shared uses domain (input of src/ui = domain in (root))',
    ]);
  });

  it('refuses a file of a folder module above the importer, and describes and resolves an input', () => {
    assert.equal(verdict('src/ui/a/a.ts', 'src/ui/notes.md'), 'above');
    const input = { kind: 'required', name: 'strings' } as const;
    assert.equal(judge().describe(module('src/ui/a'), input), 'strings (input of src/ui/a = strings in src/ui)');
    assert.deepEqual([...judge().files(module('src/ui/a'), input)], ['src/ui/strings/en.ts']);
    assert.deepEqual([...judge().files(module('src/ui/a'), { kind: 'package', pattern: 'react' })], []);
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
    const shop = `
root:
  modules:
    app: { dir: app, exposes: { files: [check.ts, 'ports/*.ts'] } }
    widgets: { dir: 'widgets/*', archetype: widget }
    quiet: { files: quiet.ts }
    main: { files: main.ts, dependencies: [app, widgets] }
archetypes:
  widget:
    exposes: all
    modules:
      api: { files: api.ts, exposes: all }
      internals: { files: '*.ts' }
`;
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
    const data = load(shop);
    const shopModel = resolveModel(data, folders(paths), paths);
    const shopVerdict = (from: string, to: string) => {
      const found = verdicts(data, shopModel).verdict(from, to)!;
      if (found.allowed) return `allowed: ${grantText(found.grant)}`;
      return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
    };
    return { data, shopModel, shopVerdict };
  };

  it("opens the files an exposes files list names, inside the module's folder", () => {
    const { shopVerdict } = shopFixture();
    assert.equal(shopVerdict('main.ts', 'app/check.ts'), 'allowed: main uses app');
    assert.equal(shopVerdict('main.ts', 'app/ports/store.ts'), 'allowed: main uses app');
    assert.equal(shopVerdict('main.ts', 'app/run.ts'), 'private to app');
    assert.equal(shopVerdict('main.ts', 'app/ports/deep/x.ts'), 'private to app');
  });

  it("opens a module's own files and each child's surface with 'all', never a child's private files", () => {
    const { shopVerdict } = shopFixture();
    assert.equal(shopVerdict('main.ts', 'widgets/a/api.ts'), 'allowed: main uses widgets');
    assert.equal(shopVerdict('main.ts', 'widgets/a/readme.md'), 'allowed: main uses widgets');
    assert.equal(shopVerdict('main.ts', 'widgets/a/util.ts'), 'private to widgets/a:internals');
  });

  it('keeps a module that says nothing closed', () => {
    const { data, shopModel, shopVerdict } = shopFixture();
    assert.equal(shopVerdict('main.ts', 'quiet.ts'), 'private to (root):quiet');
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
  unresolved: [],
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
          "src/ui/a/a.ts (logic of card src/ui/a) imports src/ui/a/a.dom.ts (render of card src/ui/a), which is outside logic's reach. No declared path allows this: either the import or the structure is wrong.",
        details: {
          from: 'src/ui/a:logic',
          to: 'src/ui/a:render',
          reason: 'not-in-dependencies',
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
      'src/main.ts (main of root (root)) imports types from src/ui/a/a.ts (logic of card src/ui/a), which src/ui/a keeps private (it exposes render, page). Import what src/ui/a exposes instead. Or, if src/ui/a/a.ts should be public, add logic to card.exposes (all 4 card modules).',
    );
    assert.deepEqual(finding?.details, {
      from: '(root):main',
      to: 'src/ui/a:logic',
      reason: 'private',
      hiddenBy: 'src/ui/a',
      edges: [edge('src/main.ts', 'src/ui/a/a.ts', { names: [], typeOnly: true })],
    });
  });

  it('tells a module that reaches above itself to require what it needs, and says when no declared path allows an import', () => {
    const [domain, card] = check([
      facts('src/domain/order.ts', [edge('src/domain/order.ts', 'src/main.ts')]),
      facts('src/ui/a/a.dom.ts', [edge('src/ui/a/a.dom.ts', 'src/ui/shared.ts', { typeOnly: true })]),
    ]);
    assert.equal(
      domain?.message,
      'src/domain/order.ts (root.domain src/domain) imports src/main.ts (main of root (root)), which (root):main keeps private (it exposes nothing). No declared path allows this: either the import or the structure is wrong.',
    );
    assert.equal(
      card?.message,
      'src/ui/a/a.dom.ts (render of card src/ui/a) imports types from src/ui/shared.ts (shared of ui src/ui), which is above src/ui/a. Add shared to card.requires, bound in the dependencies of card.sub and ui.cards and add shared to card.render.dependencies, or move the code. (+2 more in reach)',
    );
  });

  it('names the nearest using that would grant reach, and counts the rest of the reach', () => {
    const [shared, test, runner] = check([
      facts('src/ui/shared.ts', [edge('src/ui/shared.ts', 'src/runner/driver.ts')]),
      facts('src/ui/a/a.test.ts', [edge('src/ui/a/a.test.ts', 'src/runner/driver.ts')]),
      facts('src/runner/contract.ts', [edge('src/runner/contract.ts', 'src/runner/driver.ts')]),
    ]);
    assert.equal(
      shared!.message,
      "src/ui/shared.ts (shared of ui src/ui) imports src/runner/driver.ts (rest of runner src/runner), which is outside shared's reach. Add runner to ui.shared.dependencies, or move the code. (+2 more in reach)",
    );
    assert.match(test!.message, /reach\. Add runner to card\.spec\.dependencies, or move the code\. \(\+4 more/);
    assert.match(runner!.message, /outside contract's reach\. No declared path allows this/);
  });

  it('says a loose target is in no module yet, so the fix is giving it one', () => {
    const [finding] = check([facts('src/ui/a/a.ts', [edge('src/ui/a/a.ts', 'src/ui/notes.md')])]);
    assert.equal(
      finding!.message,
      "src/ui/a/a.ts (logic of card src/ui/a) imports src/ui/notes.md (loose in ui src/ui), which is in no module yet. Add a module that holds src/ui/notes.md, then add it to the importer's dependencies if the dependency is intended.",
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
        module: 'src/ui/a:spec',
        value: 2,
        message:
          "src/ui/a/a.test.ts (spec of card src/ui/a) imports react, react/jsx-runtime, a package outside spec's reach. Add npm:react to card.spec.dependencies, or move the code. (+1 more in reach)",
        details: { from: 'src/ui/a:spec', package: 'react', edges },
      },
    ]);
  });

  it("grants a dir module's packages to its files, and names the using to add a package to", () => {
    const [logic, domain] = check([
      facts('src/ui/a/a.ts', [], [external('src/ui/a/a.ts', 'node:fs', { names: [], typeOnly: true })]),
      facts('src/domain/order.ts', [], [external('src/domain/order.ts', 'lodashxget')]),
    ]);
    assert.equal(
      logic?.message,
      "src/ui/a/a.ts (logic of card src/ui/a) imports types from node:fs, a package outside logic's reach. Add node:fs to card.logic.dependencies, or move the code.",
    );
    assert.equal(logic?.value, 1);
    assert.match(
      domain!.message,
      /Add npm:lodashxget to root\.domain\.dependencies, or move the code\. \(\+2 more in reach\)$/,
    );
  });

  it('reports only the imports of a package outside reach, naming the nearest using', () => {
    const data = load(`
root:
  modules:
    leaf: { dir: leaf, archetype: leaf }
archetypes:
  leaf:
    modules:
      src: { files: '*.ts', dependencies: ['node:*', npm:vite-plus/*] }
`);
    const paths = ['leaf/a.ts'];
    const edges = [external('leaf/a.ts', 'vite-plus/test'), external('leaf/a.ts', 'vite-plus', { line: 2 })];
    const leafModel = resolveModel(data, folders(paths), paths);
    const [finding] = checkModel(data, leafModel, { files: [facts('leaf/a.ts', [], edges)] }, [moduleExternals]);
    assert.deepEqual(finding?.details, {
      from: 'leaf:src',
      package: 'vite-plus',
      edges: [edges[1]],
    });
    assert.match(
      finding!.message,
      /Add npm:vite-plus to leaf\.src\.dependencies, or move the code\. \(\+2 more in reach\)$/,
    );
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
          'src/ui/a/a.page.ts (page of card src/ui/a) re-exports src/ui/a/a.dom.ts (render of card src/ui/a), and src/ui/a exposes both, so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.',
        details: { module: 'src/ui/a', to: 'src/ui/a:render', edges },
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

describe('inputs and test code', () => {
  const files = [
    'src/log/log.ts',
    'src/kit/kit.ts',
    'src/ui/a/a.dom.ts',
    'src/ui/a/a.ts',
    'src/ui/a/a.test.ts',
    'src/ui/a/a.driver.ts',
    'src/lib/a.ts',
    'src/lib/a.test.ts',
    'src/lib/b.ts',
    'e2e/flow.test.ts',
  ];
  const yaml = `
root:
  modules:
    log: { dir: src/log, exposes: all }
    ui: { dir: src/ui, archetype: ui, dependencies: { logger: log, react: npm:react }, test: { dependencies: [kit] } }
    lib:
      dir: src/lib
      modules:
        a: { files: a.ts, dependencies: [b], test: { modules: { spec: { files: a.test.ts } } } }
        b: { files: b.ts, exposes: all }
  test:
    provides: [npm:vitest]
    modules:
      kit: { dir: src/kit }
      e2e: { dir: e2e, dependencies: [ui] }
archetypes:
  ui:
    requires: [logger, react]
    exposes: all
    test: { requires: [kit], exposes: [cards.driver] }
    modules:
      cards: { dir: '*', archetype: card, dependencies: [logger, react], test: { dependencies: [kit] } }
  card:
    marker: '{name}.dom.ts'
    requires: [logger, react]
    exposes: [render]
    modules:
      logic: { files: '*.ts', dependencies: [logger], exposes: all }
      render: { files: '{name}.dom.ts', dependencies: [logic, react], exposes: all }
    test:
      requires: [kit]
      exposes: [driver]
      modules:
        driver: { files: '*.driver.ts' }
        spec: { files: '*.test.ts', dependencies: [driver, kit] }
`;
  const setupInputs = () => {
    const loaded = load(yaml);
    const resolved = resolveModel(loaded, folders(files), files);
    return { judged: verdicts(loaded, resolved), at: (id: string) => resolved.modules.find((x) => x.id === id)! };
  };
  const said = (from: string, to: string): string => {
    const found = setupInputs().judged.verdict(from, to)!;
    return found.allowed ? grantText(found.grant) : found.reason;
  };

  it('follows an input through each archetype that passes it on, to what the use binds', () => {
    const { judged } = setupInputs();
    const found = judged.verdict('src/ui/a/a.ts', 'src/log/log.ts');
    assert.ok(found?.allowed);
    assert.equal(grantText(found.grant), 'logic uses logger (input of src/ui/a = log in (root))');
    assert.deepEqual(found.grant.via, [
      { kind: 'required', name: 'logger' },
      { kind: 'module', module: 'log' },
    ]);
    assert.deepEqual(
      judged
        .reach('src/ui/a/a.dom.ts')!
        .map((grant) => [grantText(grant), [...grant.files], grant.package, grant.via?.length]),
      [
        ['own module src/ui/a:render', ['src/ui/a/a.dom.ts'], undefined, undefined],
        ['render uses logic', ['src/ui/a/a.ts'], undefined, undefined],
        ['render uses react (input of src/ui/a = npm:react in (root))', [], 'react', 2],
      ],
    );
  });

  it('binds a test input for test code alone, and lets only test code reach a test surface', () => {
    assert.equal(said('src/ui/a/a.test.ts', 'src/kit/kit.ts'), 'spec uses kit (input of src/ui/a = kit in (root))');
    assert.equal(said('src/ui/a/a.ts', 'src/kit/kit.ts'), 'test');
    assert.equal(said('e2e/flow.test.ts', 'src/ui/a/a.driver.ts'), '(root) uses src/ui');
    assert.equal(said('src/log/log.ts', 'src/ui/a/a.driver.ts'), 'test');
    const { judged, at } = setupInputs();
    assert.deepEqual([...judged.surface(at('src/ui'), 'driver', 'test')], ['src/ui/a/a.driver.ts']);
    assert.deepEqual(
      [...judged.surface(at('src/ui'), undefined, 'test')],
      ['src/ui/a/a.dom.ts', 'src/ui/a/a.driver.ts'],
    );
    assert.deepEqual([...judged.surface(at('src/ui'))], ['src/ui/a/a.dom.ts']);
    assert.deepEqual([...judged.surface(at('src/ui/a'), 'render', 'test')], ['src/ui/a/a.dom.ts']);
    assert.deepEqual([...judged.surface(at('src/ui/a'), 'driver')], []);
  });

  it("gives a files module's tests that module, what it reaches and the test kits above, and nothing beside it", () => {
    assert.equal(said('src/lib/a.test.ts', 'src/lib/a.ts'), 'src/lib:a.spec uses src/lib:a');
    assert.equal(said('src/lib/a.test.ts', 'src/lib/b.ts'), 'a uses b');
    assert.equal(said('src/lib/a.test.ts', 'src/log/log.ts'), 'not-in-dependencies');
    assert.equal(said('src/lib/b.ts', 'src/lib/a.test.ts'), 'test');
    assert.deepEqual(setupInputs().judged.reach('src/lib/a.test.ts')!.map(grantText), [
      'own module src/lib:a.spec',
      'src/lib:a.spec uses src/lib:a',
      'a uses b',
      'root.test.provides uses npm:vitest',
    ]);
  });
});
