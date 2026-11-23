import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import {
  all,
  type AnyArchetype,
  archetype,
  dir,
  exposes,
  files,
  ruleset,
  type Ruleset,
  using,
} from '../../model/archetype/builder.ts';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../model/archetype/resolve.ts';
import type { ImportEdge, FileFacts } from '../../model/facts.ts';
import { noCrossModuleReexport } from './noCrossModuleReexport.ts';

const rule = 'no-cross-module-reexport';

const folders = (paths: readonly string[]): Folders => {
  const dirs = new Set(
    paths.flatMap((path) =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, at, all) => all.slice(0, at + 1).join('/')),
    ),
  );
  return {
    folders: (folder) =>
      [...dirs]
        .filter((path) => path.slice(0, path.lastIndexOf('/') + 1) === (folder === '' ? '' : `${folder}/`))
        .map((path) => path.slice(path.lastIndexOf('/') + 1))
        .sort(),
    exists: (path) => paths.includes(path) || dirs.has(path),
  };
};

const reExport = (from: string, to: string, extra: Partial<ImportEdge> = {}): ImportEdge => ({
  from,
  to,
  specifier: `./${to}`,
  names: ['x'],
  typeOnly: false,
  reExport: true,
  line: 2,
  ...extra,
});

const facts = (path: string, imports: ImportEdge[] = []): FileFacts => ({
  path,
  lines: 1,
  imports,
  externals: [],
  members: { members: [], links: [] },
  functions: [],
});

const paths = [
  'ports/folder.ts',
  'ports/store.ts',
  'domain/order.ts',
  'ui/index.ts',
  'ui/view.ts',
  'ui/card/card.ts',
  'ui/card/inner.ts',
  'main.ts',
];

const check = (root: AnyArchetype, analyzed: FileFacts[], rules?: Ruleset) => {
  const { config } = loadConfigData({ root, ...(rules ? { rulesets: { default: rules } } : {}) });
  const all = [
    ...analyzed,
    ...paths.filter((file) => !analyzed.some((m) => m.path === file)).map((file) => facts(file)),
  ];
  const model = resolveModel(config, folders(paths), paths);
  return checkModel(config, model, { files: all }, [noCrossModuleReexport]).filter(
    (finding) => finding.rule !== 'unclassified',
  );
};

const keys = (findings: readonly { rule: string; key: string }[]) =>
  findings.filter((finding) => finding.rule !== 'unclassified').map((finding) => finding.key);

const card = archetype('card')
  .contains((m) => m.module('src', files('*.ts'), exposes(all())))
  .exposes(all());

const uiArchetype = archetype('ui')
  .requires({ ports: dir() })
  .contains((m, { required }) =>
    m
      .module('cards', dir('{name}'), card)
      .module(
        'api',
        files('index.ts'),
        exposes(all()).using((m) => [m.cards, required.ports]),
      )
      .module('src', files('*.ts'), using([required.ports])),
  )
  .exposes((m) => ({ api: m.api }));

const ui = () => uiArchetype;

const app = (child: AnyArchetype) =>
  archetype('app')
    .contains((m) =>
      m
        .module('domain', dir('domain'), exposes(all()))
        .module(
          'ports',
          dir('ports'),
          exposes(all()).using((m) => [m.domain]),
        )
        .module('ui', dir('ui'), child)
        .module(
          'main',
          files('main.ts'),
          using((m) => [m.ui, m.ports]),
        ),
    )
    .provides((m) => ({ ports: m.ports }));

describe(rule, () => {
  it('flags a re-export of another module, even one the module may use', () => {
    const edges = [
      reExport('ui/index.ts', 'ports/folder.ts', { names: ['Folder', 'Chooser'] }),
      reExport('ui/index.ts', 'ports/folder.ts', { names: [], line: 3 }),
    ];
    assert.deepEqual(check(app(ui()), [facts('ui/index.ts', edges)]), [
      {
        rule,
        key: `${rule}:ui/index.ts->ports/folder.ts`,
        file: 'ui/index.ts',
        line: 2,
        value: 2,
        message:
          'ui/index.ts (api of ui ui) re-exports Folder, Chooser from ports/folder.ts (app.ports ports), so its importers ' +
          'reach ports through ui:api. Have importers that need it use ports directly, give ui:api its own type that ' +
          'hides it, or move it into ui:api if ui:api owns it.',
        details: {
          from: 'ui:api',
          to: 'ports',
          names: ['Folder', 'Chooser'],
          edges,
        },
      },
    ]);
  });

  it('judges the file the specifier names, and says everything for a bare export *', () => {
    const findings = check(app(ui()), [
      facts('ui/index.ts', [reExport('ui/index.ts', 'domain/order.ts', { via: 'ports/folder.ts', names: [] })]),
    ]);
    assert.deepEqual(
      findings.map((finding) => [finding.key, finding.value, finding.message.split(' (')[1]]),
      [[`${rule}:ui/index.ts->ports/folder.ts`, 1, 'api of ui ui) re-exports everything from ports/folder.ts']],
    );
  });

  it('passes a re-export within the module, a plain import, and a file outside the model', () => {
    const plain = { ...reExport('ui/view.ts', 'ports/folder.ts'), reExport: undefined };
    assert.deepEqual(
      keys(
        check(app(ui()), [
          facts('ports/folder.ts', [reExport('ports/folder.ts', 'ports/store.ts')]),
          facts('ui/card/card.ts', [reExport('ui/card/card.ts', 'ui/card/inner.ts')]),
          facts('ui/view.ts', [plain]),
          facts('outside.ts', [reExport('outside.ts', 'ports/folder.ts')]),
          facts('ui/card/inner.ts', [reExport('ui/card/inner.ts', 'nowhere.ts')]),
        ]),
      ),
      [],
    );
  });

  it('flags a re-export of a sibling module, files modules in one folder included', () => {
    assert.deepEqual(
      keys(
        check(app(ui()), [
          facts('ui/index.ts', [reExport('ui/index.ts', 'ui/view.ts'), reExport('ui/index.ts', 'ui/card/card.ts')]),
          facts('main.ts', [reExport('main.ts', 'ui/index.ts')]),
        ]),
      ),
      [`${rule}:ui/index.ts->ui/view.ts`, `${rule}:ui/index.ts->ui/card/card.ts`, `${rule}:main.ts->ui/index.ts`],
    );
  });

  it("passes a module's entry re-exporting what its own modules expose", () => {
    const entered = archetype('entered')
      .contains((m) => m.module('cards', dir('{name}'), card).module('src', files('view.ts'), exposes(all())))
      .entry(files('index.ts'));
    assert.deepEqual(
      keys(
        check(app(entered), [
          facts('ui/index.ts', [reExport('ui/index.ts', 'ui/view.ts'), reExport('ui/index.ts', 'ui/card/card.ts')]),
        ]),
      ),
      [],
    );
  });

  it("flags a nested module re-exporting its parent's files", () => {
    assert.deepEqual(keys(check(app(ui()), [facts('ui/card/card.ts', [reExport('ui/card/card.ts', 'ui/view.ts')])])), [
      `${rule}:ui/card/card.ts->ui/view.ts`,
    ]);
  });

  it('reports nothing where the rule is off, and takes no options', () => {
    const analyzed = [facts('ui/index.ts', [reExport('ui/index.ts', 'ports/folder.ts')])];
    assert.deepEqual(keys(check(app(ui()), analyzed, ruleset().on(uiArchetype.modules.api, { [rule]: false }))), []);
    assert.throws(() => noCrossModuleReexport.parseOptions!({ allow: [] }, 'at'), /at: unknown key allow/);
  });
});
