import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { FileFacts } from '../../domain/facts/facts.ts';
import { unusedDeclaration } from './rule.ts';

const rule = 'unused-declaration';

const paths = [
  'domain/order.ts',
  'domain/money.ts',
  'ports/store.ts',
  'ui/view.ts',
  'ui/view.driver.ts',
  'ui/view.test.ts',
  'ui/card/card.ts',
  'ui/list/list.ts',
  'main.ts',
  'main.test.ts',
];

const folders = (all: readonly string[]): Folders => {
  const dirs = new Set(all.flatMap((path) => (path.includes('/') ? [path.slice(0, path.lastIndexOf('/'))] : [])));
  return {
    folders: (folder) =>
      [...dirs]
        .filter((path) => path.slice(0, path.lastIndexOf('/') + 1) === (folder === '' ? '' : `${folder}/`))
        .map((path) => path.slice(path.lastIndexOf('/') + 1))
        .sort(),
    exists: (path) => all.includes(path) || dirs.has(path),
  };
};

const facts = (path: string, imports: string[] = [], packages: string[] = []): FileFacts => ({
  path,
  lines: 1,
  imports: imports.map((to) => ({ from: path, to, specifier: `./${to}`, names: ['x'], typeOnly: false, line: 1 })),
  externals: packages.map((name) => ({
    from: path,
    package: name,
    specifier: name,
    names: ['x'],
    typeOnly: false,
    line: 1,
  })),
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
});

const ui = `
  ui:
    exposes: [cards, view]
    modules:
      cards: { dir: '*', archetype: card }
      view: { files: view.ts, exposes: all }
    test:
      exposes: [driver]
      modules:
        driver: { files: '*.driver.ts' }
        tests: { files: '*.test.ts' }`;

const app = ({ extra = '', archetype = ui } = {}) => `
root:
  modules:
    domain: { dir: domain, exposes: all }
    ports: { dir: ports, exposes: all, dependencies: [domain] }
    ui: { dir: ui, archetype: ui }
    main: { files: main.ts, dependencies: [ui, ports, npm:react] }${extra}
  test:
    provides: [npm:vitest]
    modules:
      mainTests: { files: main.test.ts, dependencies: [npm:jsdom] }
archetypes:
  card:
    exposes: all
    modules:
      src: { files: '*.ts', exposes: all, dependencies: [npm:lit] }${archetype}
`;

const used: FileFacts[] = [
  facts('ports/store.ts', ['domain/order.ts']),
  facts('ui/card/card.ts', [], ['lit']),
  facts('main.ts', ['ui/card/card.ts', 'ui/view.ts', 'ports/store.ts'], ['react']),
  facts('main.test.ts', ['ui/view.driver.ts'], ['vitest', 'jsdom']),
];

const check = (structure: string, analyzed: FileFacts[], options: { rules?: string; files?: string[] } = {}) => {
  const all = options.files ?? paths;
  const rulesets = `rulesets:\n  default:\n    extends: [warp:recommended]\n${options.rules ?? ''}`;
  const { config } = loadConfigData(parse(`${structure}${rulesets}`));
  const project = {
    files: [...analyzed, ...all.filter((file) => !analyzed.some((f) => f.path === file)).map((file) => facts(file))],
  };
  return checkModel(config, resolveModel(config, folders(all), all), project, [unusedDeclaration]).filter(
    (finding) => finding.rule === rule,
  );
};

const keys = (findings: readonly { key: string }[]) => findings.map((finding) => finding.key);

const without = (path: string) => used.filter((file) => file.path !== path);

describe(rule, () => {
  it('passes a model whose every using, surface and module is used', () => {
    assert.deepEqual(check(app(), used), []);
  });

  it('flags a using no file in the module imports through, at the config file', () => {
    const findings = check(app(), [...without('ports/store.ts'), facts('domain/money.ts', ['domain/order.ts'])]);
    assert.deepEqual(
      findings.filter((finding) => finding.key.includes(':grant:')),
      [
        {
          rule,
          key: `${rule}:grant:root.ports.dependencies->domain`,
          file: 'warp.yaml',
          line: 1,
          value: 1,
          message: 'root.ports.dependencies names domain, but nothing in ports imports through it. Remove it.',
          details: {
            kind: 'grant',
            declaredIn: 'root.ports.dependencies',
            layer: 'production',
            using: 'domain',
            modules: ['ports'],
          },
        },
      ],
    );
  });

  it('counts a package using once any file it covers imports the package', () => {
    const main = facts('main.ts', ['ui/card/card.ts', 'ui/view.ts', 'ports/store.ts']);
    assert.deepEqual(keys(check(app(), [...without('main.ts'), main])), [
      `${rule}:grant:root.main.dependencies->npm:react`,
    ]);
  });

  it("reports an archetype's using once, and only when none of its modules imports through it", () => {
    assert.deepEqual(check(app(), [...without('ui/card/card.ts'), facts('ui/list/list.ts', [], ['lit'])]), []);
    const findings = check(app(), [...without('ui/card/card.ts'), facts('ui/list/list.ts')], {
      files: paths.filter((path) => path !== 'ui/card/card.ts'),
    });
    assert.deepEqual(
      findings.filter((finding) => finding.key.includes(':grant:')).map((finding) => finding.details),
      [
        {
          kind: 'grant',
          declaredIn: 'card.src.dependencies',
          layer: 'production',
          using: 'npm:lit',
          modules: ['ui/list:src'],
        },
      ],
    );
  });

  it('flags a testUsing entry that no test below imports through', () => {
    const test = facts('main.test.ts', ['ui/view.driver.ts'], ['jsdom']);
    assert.deepEqual(
      check(app(), [...without('main.test.ts'), test]).map((finding) => [finding.key, finding.message]),
      [
        [
          `${rule}:grant:root.test.provides->npm:vitest`,
          'root.test.provides names npm:vitest, but nothing in the tests of the root imports through it. Remove it.',
        ],
      ],
    );
  });

  it('flags a surface nothing outside the module imports, its own files and tests aside', () => {
    const findings = check(app(), [
      ...without('ports/store.ts'),
      facts('ports/store.ts'),
      facts('domain/money.ts', ['domain/order.ts']),
    ]);
    assert.deepEqual(
      findings.map((finding) => [finding.key, finding.message]),
      [
        [
          `${rule}:grant:root.ports.dependencies->domain`,
          'root.ports.dependencies names domain, but nothing in ports imports through it. Remove it.',
        ],
        [
          `${rule}:surface:root.domain:exposes: all`,
          'root.domain exposes: all, but nothing outside domain imports it. Remove it, or use the module where it is needed.',
        ],
      ],
    );
  });

  it('judges each named surface on its own, and never the root', () => {
    const main = facts('main.ts', ['ui/card/card.ts', 'ports/store.ts'], ['react']);
    assert.deepEqual(
      check(app(), [...without('main.ts'), main]).map((finding) => finding.details),
      [
        { kind: 'surface', declaredIn: 'ui', layer: 'production', exposes: 'exposes view', modules: ['ui'] },
        {
          kind: 'surface',
          declaredIn: 'ui.view',
          layer: 'production',
          exposes: 'exposes: all',
          modules: ['ui:view'],
        },
      ],
    );
  });

  it('flags a test surface that no test outside imports', () => {
    const test = facts('main.test.ts', [], ['vitest', 'jsdom']);
    assert.deepEqual(keys(check(app(), [...without('main.test.ts'), test])), [
      `${rule}:surface:ui:test.exposes driver`,
    ]);
  });

  it('flags a module whose selector matches no files, without reporting its own using or surface', () => {
    const extra = `
    legacy: { dir: legacy, exposes: all, dependencies: [domain] }
    styles: { files: '*.css', exposes: all }`;
    const findings = check(app({ extra }), used, { files: paths.filter((path) => path !== 'ui/view.driver.ts') });
    assert.deepEqual(
      findings.map((finding) => [finding.key, finding.message]),
      [
        [
          `${rule}:surface:ui:test.exposes driver`,
          'ui test.exposes driver, but no test outside ui imports it. Remove it, or use the module where it is needed.',
        ],
        [
          `${rule}:empty:ui.driver`,
          "ui.driver matches no files: files: '*.driver.ts' finds nothing in ui. Fix the pattern, or remove the module.",
        ],
        [
          `${rule}:empty:root.legacy`,
          'root.legacy matches no files: dir: legacy finds nothing in the root. Fix the pattern, or remove the module.',
        ],
        [
          `${rule}:empty:root.styles`,
          "root.styles matches no files: files: '*.css' finds nothing in the root. Fix the pattern, or remove the module.",
        ],
      ],
    );
  });

  it("flags a test module's using that its files don't import through", () => {
    const test = facts('main.test.ts', ['ui/view.driver.ts'], ['vitest']);
    assert.deepEqual(
      check(app(), [...without('main.test.ts'), test]).map((finding) => finding.message),
      ['root.mainTests.dependencies names npm:jsdom, but nothing in (root):mainTests imports through it. Remove it.'],
    );
  });

  it('judges an import on the file its specifier names', () => {
    const store = facts('ports/store.ts');
    store.imports = [{ ...facts('x', ['domain/order.ts']).imports[0]!, from: 'ports/store.ts', via: 'ui/view.ts' }];
    assert.deepEqual(keys(check(app(), [...without('ports/store.ts'), store])), [
      `${rule}:grant:root.ports.dependencies->domain`,
      `${rule}:surface:root.domain:exposes: all`,
    ]);
  });

  it('names every module a declaration covers', () => {
    const main = facts('main.ts', ['ui/view.ts', 'ports/store.ts'], ['react']);
    const rest = used.filter((file) => !['main.ts', 'ui/card/card.ts'].includes(file.path));
    const findings = check(app(), [...rest, main]);
    assert.deepEqual(
      findings.filter((finding) => finding.key.includes(':card')).map((finding) => finding.message),
      [
        'card.src.dependencies names npm:lit, but nothing in ui/card:src, ui/list:src imports through it. Remove it.',
        'card exposes: all, but nothing outside ui/card, ui/list imports it. Remove it, or use the module where it is needed.',
        'card.src exposes: all, but nothing outside ui/card:src, ui/list:src imports it. Remove it, or use the module where it is needed.',
      ],
    );
  });

  it("shows a files surface and a test module's surface as written", () => {
    const shelf = `
  ui:
    entry: index.ts
    modules:
      src: { files: '*.ts', exposes: { files: view.ts } }
    test:
      modules:
        driver: { files: '*.driver.ts' }
        fake: { files: '*.fake.ts', exposes: { files: view.fake.ts } }`;
    const all = [
      ...paths.filter((path) => !path.startsWith('ui/')),
      'ui/index.ts',
      'ui/view.ts',
      'ui/view.fake.ts',
      'ui/stub.driver.ts',
    ];
    const test = facts('main.test.ts', ['ui/stub.driver.ts'], ['vitest', 'jsdom']);
    const rest = used.filter((file) => !['main.ts', 'main.test.ts'].includes(file.path));
    const findings = check(app({ archetype: shelf }), [...rest, test], { files: all });
    assert.deepEqual(
      keys(findings).filter((key) => key.includes(':surface:ui')),
      [
        `${rule}:surface:ui.src:exposes: { files: [view.ts] }`,
        `${rule}:surface:ui.fake:exposes: { files: [view.fake.ts] }`,
      ],
    );
  });

  it("counts a top-level module's entry as used, since the package's users import it", () => {
    const root = `
root:
  modules:
    package: { dir: src, archetype: package }
archetypes:
  package:
    entry: index.ts
    modules:
      lib: { dir: lib, archetype: lib }
  lib:
    entry: index.ts
`;
    const tree = ['src/index.ts', 'src/lib/index.ts'];
    const findings = check(root, [facts('src/index.ts', ['src/lib/index.ts'])], { files: tree });
    assert.deepEqual(findings, []);
  });

  it('judges an entry below the top level, shown as written', () => {
    const root = `
root:
  modules:
    package: { dir: src, archetype: package }
archetypes:
  package:
    modules:
      lib: { dir: lib, archetype: lib }
  lib:
    entry: index.ts
`;
    const tree = ['src/index.ts', 'src/lib/index.ts'];
    const findings = check(root, [], { files: tree });
    assert.deepEqual(keys(findings), [`${rule}:surface:lib:entry: index.ts`]);
  });

  it('reports nothing where a ruleset turns it off everywhere', () => {
    const extra = `
    styles: { files: ['*.css', '*.scss'], exposes: all }`;
    const findings = check(app({ extra }), used);
    assert.deepEqual(keys(findings), [`${rule}:empty:root.styles`]);
    assert.equal(
      findings[0]!.message,
      "root.styles matches no files: files: ['*.css', '*.scss'] finds nothing in the root. Fix the pattern, or remove the module.",
    );
    assert.deepEqual(check(app({ extra }), used, { rules: `    rules: { ${rule}: off }\n` }), []);
  });

  it('is off where a ruleset turns it off', () => {
    const analyzed = [...without('ui/card/card.ts'), facts('ui/list/list.ts')];
    const options = { files: paths.filter((path) => path !== 'ui/card/card.ts') };
    const keyed = (rules?: string) => keys(check(app(), analyzed, { ...options, ...(rules ? { rules } : {}) }));
    assert.ok(keyed().includes(`${rule}:grant:card.src.dependencies->npm:lit`));
    assert.deepEqual(
      keyed(`    on: { card: { ${rule}: off } }\n`),
      keyed().filter((key) => !key.includes(':card')),
    );
  });

  describe('requires', () => {
    const nested = `
root:
  modules:
    log: { dir: log, exposes: all }
    ui: { dir: ui, archetype: ui, dependencies: [log] }
archetypes:
  ui:
    requires: [log]
    exposes: [cards]
    modules:
      cards: { dir: '*', archetype: card, dependencies: [log] }
  card:
    requires: [log]
    exposes: all
    modules:
      src: { files: '*.ts', exposes: all, dependencies: [log] }
      sub: { dir: '*', archetype: card, dependencies: [log] }
`;
    const files = ['log/log.ts', 'ui/ui.ts', 'ui/a/a.ts', 'ui/a/b/b.ts'];
    const grants = (analyzed: FileFacts[]) =>
      check(nested, analyzed, { files })
        .filter((finding) => finding.key.includes(':grant:'))
        .map((finding) => [finding.key, finding.message]);

    it('counts every binding of a requires once any instance imports through it', () => {
      assert.deepEqual(grants([facts('ui/a/a.ts', ['log/log.ts'])]), []);
    });

    it('reports a requires no instance imports through, in place of its bindings', () => {
      assert.deepEqual(grants([]), [
        [
          `${rule}:grant:ui.requires->log`,
          'ui.requires names log, but nothing in ui imports through it. Remove it, with its binding at each use.',
        ],
        [
          `${rule}:grant:card.requires->log`,
          'card.requires names log, but nothing in ui/a, ui/a/b imports through it. Remove it, with its binding at each use.',
        ],
      ]);
    });

    it('reports a binding of a name the archetype does not require', () => {
      const extra = nested
        .replace(
          '    ui: { dir: ui, archetype: ui, dependencies: [log] }',
          '    ui: { dir: ui, archetype: ui, dependencies: [log, other] }',
        )
        .replace(
          '    log: { dir: log, exposes: all }',
          '    log: { dir: log, exposes: all }\n    other: { dir: other, exposes: all }',
        );
      const findings = check(extra, [facts('ui/a/a.ts', ['log/log.ts'])], { files: [...files, 'other/o.ts'] });
      assert.deepEqual(keys(findings.filter((finding) => finding.key.includes(':grant:'))), [
        `${rule}:grant:root.ui.dependencies->other`,
      ]);
    });

    it('reports a module naming a requires that another module imports through', () => {
      const shared = nested.replace(
        "      sub: { dir: '*'",
        "      icons: { files: '*.svg', dependencies: [log] }\n      sub: { dir: '*'",
      );
      const findings = check(shared, [facts('ui/a/a.ts', ['log/log.ts'])], { files: [...files, 'ui/a/a.svg'] });
      assert.deepEqual(keys(findings.filter((finding) => finding.key.includes(':grant:'))), [
        `${rule}:grant:card.icons.dependencies->log`,
      ]);
    });
  });
});
