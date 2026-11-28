import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { Export, FileFacts, ImportEdge } from '../../domain/facts/facts.ts';
import { unusedExport } from './rule.ts';

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

const use = (to: string, names: string[], more: Partial<ImportEdge> = {}): ImportEdge => ({
  from: '',
  to,
  specifier: to,
  names,
  typeOnly: false,
  line: 1,
  ...more,
});

const exported = (name: string, file: string, line = 1, declared = name): Export => ({
  name,
  line,
  declared: { file, name: declared },
});

const facts = (path: string, imports: ImportEdge[] = [], exports: Export[] = []): FileFacts => ({
  path,
  lines: 1,
  imports: imports.map((edge) => ({ ...edge, from: path })),
  externals: [],
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
  classes: [],
  chains: [],
  exports,
});

const yaml = (billing = '') => `
root:
  ruleset: { rules: { unused-export: on } }
  modules:
    app:
      dir: app
      modules:
        billing: { dir: billing, entry: index.ts${billing} }
        helpers:
          dir: helpers
          exposes: { files: [api.ts, inner/deep.ts] }
          modules: { inner: { dir: inner, exposes: all } }
        wide: { dir: wide, exposes: all }
        shared: { files: shared.ts, exposes: { files: [shared.ts] } }
        loose: { files: loose.ts, exposes: all }
        ui: { dir: ui, dependencies: [billing, helpers, wide] }
      test: { modules: { tests: { dir: tests, dependencies: [billing] } } }
    top: { dir: top, entry: index.ts }
    lib: { dir: lib, exposes: { files: [api.ts] } }
`;

const refund = 'app/billing/refund.ts';
const api = 'app/helpers/api.ts';

const project = (ui: ImportEdge[]) => [
  facts(
    'app/billing/index.ts',
    [use(refund, ['refund', 'reissue'], { reExport: true })],
    [exported('refund', refund, 1), exported('reissue', refund, 1), exported('redo', refund, 2, 'reissue')],
  ),
  facts(refund, [], [exported('refund', refund, 1), exported('reissue', refund, 3)]),
  facts('app/billing/audit.ts', [use(refund, ['reissue'])]),
  facts(api, [], [exported('slug', api, 1), exported('Slug', api, 2), exported('pad', api, 3)]),
  facts('app/wide/wide.ts', [], [exported('unused', 'app/wide/wide.ts')]),
  facts('app/ui/page.ts', ui),
  facts('app/tests/refund.ts', [use(refund, ['reissue'], { via: 'app/billing/index.ts' })]),
  facts('top/index.ts', [], [exported('unused', 'top/index.ts')]),
  facts('app/helpers/inner/deep.ts', [], [exported('unused', 'app/helpers/inner/deep.ts')]),
  facts('app/shared.ts', [], [exported('shared', 'app/shared.ts')]),
  facts('app/loose.ts', [], [exported('loose', 'app/loose.ts')]),
  facts('lib/api.ts', [], [exported('lib', 'lib/api.ts')]),
];

const uiImports = [
  use(refund, ['refund'], { via: 'app/billing/index.ts' }),
  use(api, ['slug']),
  use(api, ['Slug'], { typeOnly: true }),
];

const runAll = (ui = uiImports, billing = '') => {
  const config = loadConfigData(parse(yaml(billing)), { builtins: { rules: [unusedExport] } }).config;
  const files = project(ui);
  const paths = files.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files }, [unusedExport]);
};

const run = (ui = uiImports, billing = '') =>
  runAll(ui, billing).filter(({ file }) => file.startsWith('app/billing/') || file.startsWith('app/helpers/'));

describe('unused-export', () => {
  it('reports a name on a chosen surface that no production file outside the module imports', () => {
    assert.deepEqual(run(), [
      {
        rule: 'unused-export',
        key: 'unused-export:app/billing/index.ts#reissue',
        file: 'app/billing/index.ts',
        line: 1,
        module: 'app/billing',
        value: 1,
        message:
          "app/billing/index.ts exports reissue on app/billing's surface, but nothing outside app/billing imports it. " +
          'Stop exporting it from app/billing/index.ts, or keep the file off the surface.',
        details: { module: 'app/billing', name: 'reissue', declared: { file: refund, name: 'reissue' } },
      },
      {
        rule: 'unused-export',
        key: 'unused-export:app/billing/index.ts#redo',
        file: 'app/billing/index.ts',
        line: 2,
        module: 'app/billing',
        value: 1,
        message:
          "app/billing/index.ts exports redo on app/billing's surface, but nothing outside app/billing imports it. " +
          'Stop exporting it from app/billing/index.ts, or keep the file off the surface.',
        details: { module: 'app/billing', name: 'redo', declared: { file: refund, name: 'reissue' } },
      },
      {
        rule: 'unused-export',
        key: 'unused-export:app/helpers/api.ts#pad',
        file: api,
        line: 3,
        module: 'app/helpers',
        value: 1,
        message:
          "app/helpers/api.ts exports pad on app/helpers's surface, but nothing outside app/helpers imports it. " +
          'Stop exporting it from app/helpers/api.ts, or keep the file off the surface.',
        details: { module: 'app/helpers', name: 'pad', declared: { file: api, name: 'pad' } },
      },
    ]);
  });

  it('judges files modules and top-level modules by their chosen files, but not a top-level entry', () => {
    assert.deepEqual(
      runAll().map(({ key }) => key),
      [
        'unused-export:app/billing/index.ts#reissue',
        'unused-export:app/billing/index.ts#redo',
        'unused-export:app/helpers/api.ts#pad',
        'unused-export:app/shared.ts#shared',
        'unused-export:lib/api.ts#lib',
      ],
    );
  });

  it('counts a namespace import of a surface file as a use of every name it exports', () => {
    const keys = run([...uiImports, use(api, ['*'])]).map(({ key }) => key);
    assert.deepEqual(keys, ['unused-export:app/billing/index.ts#reissue', 'unused-export:app/billing/index.ts#redo']);
  });

  it('counts a use of the declaration under any name it is exported as', () => {
    const keys = run([...uiImports, use(refund, ['reissue'], { via: 'app/billing/index.ts' })]).map(({ key }) => key);
    assert.deepEqual(keys, ['unused-export:app/helpers/api.ts#pad']);
  });

  it('judges only where the rule is on', () => {
    const keys = run(uiImports, ', ruleset: { rules: { unused-export: off } }').map(({ key }) => key);
    assert.deepEqual(keys, ['unused-export:app/helpers/api.ts#pad']);
  });
});
