import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import {
  all,
  type AnyArchetype,
  archetype,
  dir,
  exposes,
  files,
  pkg,
  ruleset,
  type Ruleset,
  using,
} from '../../model/archetype/builder.ts';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../model/archetype/resolve.ts';
import type { FileFacts } from '../../model/facts.ts';
import { unusedDeclaration } from './unusedDeclaration.ts';

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

const card = () =>
  archetype('card')
    .contains((m) => m.module('src', files('*.ts'), exposes(all()).using([pkg('lit')])))
    .exposes(all());

const ui = (cards: AnyArchetype = card()) =>
  archetype('ui')
    .contains((m) =>
      m
        .module('cards', dir('{name}'), cards)
        .module('view', files('view.ts'), exposes(all()))
        .testModule('driver', files('*.driver.ts'))
        .testModule('tests', files('*.test.ts')),
    )
    .exposes((m) => ({ cards: m.cards, view: m.view, driver: m.driver }));

const app = (extra: (m: any) => any = (m) => m, uiArchetype: AnyArchetype = ui()) =>
  archetype('app')
    .contains((m) =>
      extra(
        m
          .module('domain', dir('domain'), exposes(all()))
          .module(
            'ports',
            dir('ports'),
            exposes(all()).using((m) => [m.domain]),
          )
          .module('ui', dir('ui'), uiArchetype)
          .module(
            'main',
            files('main.ts'),
            using((m) => [m.ui, m.ports, pkg('react')]),
          )
          .testModule('mainTests', files('main.test.ts'), using([pkg('jsdom')])),
      ),
    )
    .exposes(all())
    .testUsing([pkg('vitest')]);

const used: FileFacts[] = [
  facts('ports/store.ts', ['domain/order.ts']),
  facts('ui/card/card.ts', [], ['lit']),
  facts('main.ts', ['ui/card/card.ts', 'ui/view.ts', 'ports/store.ts'], ['react']),
  facts('main.test.ts', ['ui/view.driver.ts'], ['vitest', 'jsdom']),
];

const check = (root: AnyArchetype, analyzed: FileFacts[], options: { rules?: Ruleset; files?: string[] } = {}) => {
  const all = options.files ?? paths;
  const { config } = loadConfigData({
    root,
    ...(options.rules ? { rulesets: { default: options.rules } } : {}),
  });
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
          key: `${rule}:grant:app.ports->domain`,
          file: 'warp.config.ts',
          line: 1,
          value: 1,
          message: 'app.ports uses domain, but nothing in ports imports through it. Remove it from the using.',
          details: { kind: 'grant', declaredIn: 'app.ports', layer: 'production', using: 'domain', modules: ['ports'] },
        },
      ],
    );
  });

  it('counts a package using once any file it covers imports the package', () => {
    const main = facts('main.ts', ['ui/card/card.ts', 'ui/view.ts', 'ports/store.ts']);
    assert.deepEqual(keys(check(app(), [...without('main.ts'), main])), [`${rule}:grant:app.main->pkg('react')`]);
  });

  it("reports an archetype's using once, and only when none of its modules imports through it", () => {
    assert.deepEqual(check(app(), [...without('ui/card/card.ts'), facts('ui/list/list.ts', [], ['lit'])]), []);
    const findings = check(app(), [...without('ui/card/card.ts'), facts('ui/list/list.ts')], {
      files: paths.filter((path) => path !== 'ui/card/card.ts'),
    });
    assert.deepEqual(
      findings.filter((finding) => finding.key.includes(':grant:')).map((finding) => finding.details),
      [{ kind: 'grant', declaredIn: 'card.src', layer: 'production', using: "pkg('lit')", modules: ['ui/list:src'] }],
    );
  });

  it('flags a testUsing entry that no test below imports through', () => {
    const test = facts('main.test.ts', ['ui/view.driver.ts'], ['jsdom']);
    assert.deepEqual(
      check(app(), [...without('main.test.ts'), test]).map((finding) => [finding.key, finding.message]),
      [
        [
          `${rule}:grant:app.testUsing->pkg('vitest')`,
          "app.testUsing uses pkg('vitest'), but nothing in the tests of the root imports through it. Remove it from the using.",
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
          `${rule}:grant:app.ports->domain`,
          'app.ports uses domain, but nothing in ports imports through it. Remove it from the using.',
        ],
        [
          `${rule}:surface:app.domain:exposes(all())`,
          'app.domain exposes(all()), but nothing outside domain imports it. Remove it, or use the module where it is needed.',
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
          exposes: 'exposes(all())',
          modules: ['ui:view'],
        },
      ],
    );
  });

  it('flags a surface naming a test module that no test outside imports', () => {
    const test = facts('main.test.ts', [], ['vitest', 'jsdom']);
    assert.deepEqual(keys(check(app(), [...without('main.test.ts'), test])), [`${rule}:surface:ui:exposes driver`]);
  });

  it('flags a module whose selector matches no files, without reporting its own using or surface', () => {
    const extra = (m: any) =>
      m
        .module(
          'legacy',
          dir('legacy'),
          exposes(all()).using((m: any) => [m.domain]),
        )
        .module('styles', files('*.css'), exposes(all()));
    const findings = check(app(extra), used, { files: paths.filter((path) => path !== 'ui/view.driver.ts') });
    assert.deepEqual(
      findings.map((finding) => [finding.key, finding.message]),
      [
        [
          `${rule}:surface:ui:exposes driver`,
          'ui exposes driver, but nothing outside ui imports it. Remove it, or use the module where it is needed.',
        ],
        [
          `${rule}:empty:app.legacy`,
          "app.legacy matches no files: dir('legacy') finds nothing in the root. Fix the selector, or remove the module.",
        ],
        [
          `${rule}:empty:app.styles`,
          "app.styles matches no files: files('*.css') finds nothing in the root. Fix the selector, or remove the module.",
        ],
        [
          `${rule}:empty:ui.driver`,
          "ui.driver matches no files: files('*.driver.ts') finds nothing in ui. Fix the selector, or remove the module.",
        ],
      ],
    );
  });

  it("flags a test module's using that its files don't import through", () => {
    const test = facts('main.test.ts', ['ui/view.driver.ts'], ['vitest']);
    assert.deepEqual(
      check(app(), [...without('main.test.ts'), test]).map((finding) => finding.message),
      [
        "app.mainTests uses pkg('jsdom'), but nothing in (root):mainTests imports through it. Remove it from the using.",
      ],
    );
  });

  it('judges an import on the file its specifier names', () => {
    const store = facts('ports/store.ts');
    store.imports = [{ ...facts('x', ['domain/order.ts']).imports[0]!, from: 'ports/store.ts', via: 'ui/view.ts' }];
    assert.deepEqual(keys(check(app(), [...without('ports/store.ts'), store])), [
      `${rule}:grant:app.ports->domain`,
      `${rule}:surface:app.domain:exposes(all())`,
    ]);
  });

  it('names every module a declaration covers', () => {
    const main = facts('main.ts', ['ui/view.ts', 'ports/store.ts'], ['react']);
    const rest = used.filter((file) => !['main.ts', 'ui/card/card.ts'].includes(file.path));
    const findings = check(app(), [...rest, main]);
    assert.deepEqual(
      findings.filter((finding) => finding.key.includes(':card')).map((finding) => finding.message),
      [
        "card.src uses pkg('lit'), but nothing in ui/card:src, ui/list:src imports through it. Remove it from the using.",
        'card exposes(all()), but nothing outside ui/card, ui/list imports it. Remove it, or use the module where it is needed.',
        'card.src exposes(all()), but nothing outside ui/card:src, ui/list:src imports it. Remove it, or use the module where it is needed.',
      ],
    );
  });

  it("shows a files surface and a test module's surface as written", () => {
    const shelf = archetype('ui')
      .contains((m) =>
        m
          .module('src', files('*.ts'), exposes(files('view.ts')))
          .testModule('driver', files('*.driver.ts'))
          .testModule('fake', files('*.fake.ts'), exposes(files('view.fake.ts'))),
      )
      .entry(files('index.ts'));
    const all = [
      ...paths.filter((path) => !path.startsWith('ui/')),
      'ui/index.ts',
      'ui/view.ts',
      'ui/view.fake.ts',
      'ui/stub.driver.ts',
    ];
    const test = facts('main.test.ts', ['ui/stub.driver.ts'], ['vitest', 'jsdom']);
    const rest = used.filter((file) => !['main.ts', 'main.test.ts'].includes(file.path));
    const findings = check(app(undefined, shelf), [...rest, test], { files: all });
    assert.deepEqual(
      keys(findings).filter((key) => key.includes(':surface:ui')),
      [`${rule}:surface:ui.src:exposes(files('view.ts'))`, `${rule}:surface:ui.fake:exposes(files('view.fake.ts'))`],
    );
  });

  it("counts a top-level module's entry as used, since the package's users import it", () => {
    const pkgArchetype = archetype('package')
      .contains((c) => c.module('lib', dir('lib'), archetype('lib').entry(files('index.ts'))))
      .entry(files('index.ts'));
    const root = archetype('repo').contains((c) => c.module('package', dir('src'), pkgArchetype));
    const tree = ['src/index.ts', 'src/lib/index.ts'];
    const findings = check(root, [facts('src/index.ts', ['src/lib/index.ts'])], { files: tree });
    assert.deepEqual(findings, []);
  });

  it('judges an entry below the top level, shown as written', () => {
    const lib = archetype('lib').entry(files('index.ts'));
    const pkgArchetype = archetype('package').contains((c) => c.module('lib', dir('lib'), lib));
    const root = archetype('repo').contains((c) => c.module('package', dir('src'), pkgArchetype));
    const tree = ['src/index.ts', 'src/lib/index.ts'];
    const findings = check(root, [], { files: tree });
    assert.deepEqual(keys(findings), [`${rule}:surface:lib:.entry(files('index.ts'))`]);
  });

  it('reports nothing where a ruleset turns it off everywhere', () => {
    const extra = (m: any) => m.module('styles', files('*.css', '*.scss'), exposes(all()));
    const findings = check(app(extra), used);
    assert.deepEqual(keys(findings), [`${rule}:empty:app.styles`]);
    assert.equal(
      findings[0]!.message,
      "app.styles matches no files: files('*.css', '*.scss') finds nothing in the root. Fix the selector, or remove the module.",
    );
    assert.deepEqual(check(app(extra), used, { rules: ruleset().rules({ [rule]: false }) }), []);
  });

  it('is off where a ruleset turns it off', () => {
    const analyzed = [...without('ui/card/card.ts'), facts('ui/list/list.ts')];
    const options = { files: paths.filter((path) => path !== 'ui/card/card.ts') };
    const cards = card();
    const keyed = (rules?: Ruleset) =>
      keys(check(app(undefined, ui(cards)), analyzed, { ...options, ...(rules ? { rules } : {}) }));
    assert.ok(keyed().includes(`${rule}:grant:card.src->pkg('lit')`));
    assert.deepEqual(
      keyed(ruleset().on(cards, { [rule]: false })),
      keyed().filter((key) => !key.includes(':card')),
    );
  });
});
