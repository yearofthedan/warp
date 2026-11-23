import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { type AnyArchetype, archetype, dir, type Ruleset, ruleset } from '../../model/archetype/builder.ts';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../model/archetype/resolve.ts';
import type { ImportEdge, FileFacts } from '../../model/facts.ts';
import { noCrossUnitReexport } from './noCrossUnitReexport.ts';

const rule = 'no-cross-unit-reexport';

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

const files = ['ports/folder.ts', 'domain/order.ts', 'ui/index.ts', 'ui/view.ts', 'ui/card/card.ts', 'main.ts'];

const check = (root: AnyArchetype, analyzed: FileFacts[], rules?: Ruleset) => {
  const { config } = loadConfigData({ root, ...(rules ? { rulesets: { default: rules } } : {}) });
  const all = [
    ...analyzed,
    ...files.filter((file) => !analyzed.some((m) => m.path === file)).map((file) => facts(file)),
  ];
  const model = resolveModel(config, folders(files), files);
  return checkModel(config, model, { files: all }, [noCrossUnitReexport]).filter(
    (finding) => finding.rule !== 'unclassified',
  );
};

const keys = (findings: readonly { rule: string; key: string }[]) =>
  findings.filter((finding) => finding.rule !== 'unclassified').map((finding) => finding.key);

const card = archetype('card').contains((p) => p.files('src', '*.ts'));

const uiArchetype = archetype('ui')
  .requires({ ports: dir() })
  .contains((p, { required }) =>
    p
      .dir('cards', '{name}', card)
      .files('api', 'index.ts', { using: (s) => [s.cards, required.ports] })
      .files('src', '*.ts', { using: [required.ports] }),
  );

const ui = () => uiArchetype;

const app = (child: AnyArchetype) =>
  archetype('app')
    .contains((p) =>
      p
        .dir('domain', 'domain')
        .dir('ports', 'ports', { using: (s) => [s.domain] })
        .dir('ui', 'ui', child)
        .files('main', 'main.ts', { using: (s) => [s.ui, s.ports] }),
    )
    .provides((s) => ({ ports: s.ports }));

describe(rule, () => {
  it('flags a re-export of another unit, even one the unit may use', () => {
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
          'ui/index.ts (api of ui ui) re-exports Folder, Chooser from ports/folder.ts (plain folder ports), so its importers ' +
          'reach ports through ui. Have importers that need it use ports directly, give ui its own type that ' +
          'hides it, or move it into ui if ui owns it.',
        details: {
          from: { unit: 'ui', part: 'api' },
          to: { unit: 'ports', part: undefined },
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

  it('passes a re-export within the unit or from a unit nested in it, and plain imports', () => {
    const plain = { ...reExport('ui/view.ts', 'ports/folder.ts'), reExport: undefined };
    assert.deepEqual(
      keys(
        check(app(ui()), [
          facts('ui/index.ts', [reExport('ui/index.ts', 'ui/view.ts'), reExport('ui/index.ts', 'ui/card/card.ts')]),
          facts('ui/view.ts', [plain]),
          facts('main.ts', [reExport('main.ts', 'ui/index.ts')]),
          facts('outside.ts', [reExport('outside.ts', 'ports/folder.ts')]),
          facts('ui/card/card.ts', [reExport('ui/card/card.ts', 'nowhere.ts')]),
        ]),
      ),
      [],
    );
  });

  it("flags a nested unit re-exporting its parent's files", () => {
    assert.deepEqual(keys(check(app(ui()), [facts('ui/card/card.ts', [reExport('ui/card/card.ts', 'ui/view.ts')])])), [
      `${rule}:ui/card/card.ts->ui/view.ts`,
    ]);
  });

  it('reports nothing where the rule is off, and takes no options', () => {
    const analyzed = [facts('ui/index.ts', [reExport('ui/index.ts', 'ports/folder.ts')])];
    assert.deepEqual(keys(check(app(ui()), analyzed, ruleset().on(uiArchetype.api, { [rule]: false }))), []);
    assert.throws(() => noCrossUnitReexport.parseOptions!({ allow: [] }, 'at'), /at: unknown key allow/);
  });
});
