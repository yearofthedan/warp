import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { ImportEdge, FileFacts } from '../../domain/facts/facts.ts';
import { noCrossModuleReexport } from './rule.ts';

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
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
  classes: [],
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

const structure = (child: string) => `
root:
  modules:
    domain: { dir: domain, exposes: all }
    ports: { dir: ports, exposes: all, dependencies: [domain] }
    ui: { dir: ui, archetype: ${child}, dependencies: [ports] }
    main: { files: main.ts, dependencies: [ui, ports] }
archetypes:
  card:
    exposes: all
    modules:
      src: { files: '*.ts', exposes: all }
  ui:
    requires: [ports]
    exposes: [api]
    modules:
      cards: { dir: '*', archetype: card }
      api: { files: index.ts, exposes: all, dependencies: [cards, ports] }
      src: { files: '*.ts', dependencies: [ports] }
  entered:
    requires: [ports]
    entry: index.ts
    modules:
      cards: { dir: '*', archetype: card }
      src: { files: view.ts, exposes: all, dependencies: [ports] }
`;

const check = (analyzed: FileFacts[], { child = 'ui', edit = (yaml: string) => yaml } = {}) => {
  const raw = parse(edit(structure(child)));
  const { config } = loadConfigData({
    ...raw,
    root: { ruleset: { rules: { 'no-cross-module-reexport': 'on' } }, ...raw.root },
  });
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

describe(rule, () => {
  it('flags a re-export of another module, even one the module may use', () => {
    const edges = [
      reExport('ui/index.ts', 'ports/folder.ts', { names: ['Folder', 'Chooser'] }),
      reExport('ui/index.ts', 'ports/folder.ts', { names: [], line: 3 }),
    ];
    assert.deepEqual(check([facts('ui/index.ts', edges)]), [
      {
        rule,
        key: `${rule}:ui/index.ts->ports/folder.ts`,
        file: 'ui/index.ts',
        line: 2,
        module: 'ui:api',
        value: 2,
        message:
          'ui/index.ts (api of ui ui) re-exports Folder, Chooser from ports/folder.ts (root.ports ports), so its importers ' +
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

  it('drops the advice to use the target directly when an importer may not', () => {
    const through = (from: string) => ({
      ...reExport(from, 'ports/folder.ts', { via: 'ui/index.ts' }),
      reExport: undefined,
    });
    const [finding] = check([
      facts('ui/index.ts', [reExport('ui/index.ts', 'ports/folder.ts')]),
      facts('main.ts', [through('main.ts')]),
      facts('domain/order.ts', [through('domain/order.ts')]),
    ]);
    assert.match(
      finding!.message,
      / through ui:api\. domain\/order\.ts may not use ports directly, so give ui:api its own type that hides it, /,
    );
    const [two] = check([
      facts('ui/index.ts', [reExport('ui/index.ts', 'ports/folder.ts')]),
      facts('domain/order.ts', [through('domain/order.ts')]),
      facts('ui/card/card.ts', [through('ui/card/card.ts')]),
    ]);
    assert.match(two!.message, /domain\/order\.ts and 1 other importer may not use ports directly/);
  });

  it('judges the file the specifier names, and says everything for a bare export *', () => {
    const findings = check([
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
        check([
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
        check([
          facts('ui/index.ts', [reExport('ui/index.ts', 'ui/view.ts'), reExport('ui/index.ts', 'ui/card/card.ts')]),
          facts('main.ts', [reExport('main.ts', 'ui/index.ts')]),
        ]),
      ),
      [`${rule}:ui/index.ts->ui/view.ts`, `${rule}:ui/index.ts->ui/card/card.ts`, `${rule}:main.ts->ui/index.ts`],
    );
  });

  it("passes a module's entry re-exporting what its own modules expose", () => {
    assert.deepEqual(
      keys(
        check(
          [facts('ui/index.ts', [reExport('ui/index.ts', 'ui/view.ts'), reExport('ui/index.ts', 'ui/card/card.ts')])],
          { child: 'entered' },
        ),
      ),
      [],
    );
  });

  it("flags a nested module re-exporting its parent's files", () => {
    assert.deepEqual(keys(check([facts('ui/card/card.ts', [reExport('ui/card/card.ts', 'ui/view.ts')])])), [
      `${rule}:ui/card/card.ts->ui/view.ts`,
    ]);
  });

  it('reports nothing where the rule is off, and takes no options', () => {
    const analyzed = [facts('ui/index.ts', [reExport('ui/index.ts', 'ports/folder.ts')])];
    assert.deepEqual(
      keys(
        check(analyzed, {
          edit: (yaml) =>
            yaml.replace('api: { files: index.ts,', `api: { ruleset: { rules: { ${rule}: off } }, files: index.ts,`),
        }),
      ),
      [],
    );
    assert.throws(() => noCrossModuleReexport.parseOptions!({ allow: [] }, 'at'), /at: unknown key allow/);
  });
});
