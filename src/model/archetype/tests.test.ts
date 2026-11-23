import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ImportEdge, FileFacts } from '../facts.ts';
import { all, archetype, dir, exposes, files } from './builder.ts';
import { builtinRules } from '../../builtins/index.ts';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { grantText, verdicts } from './reach.ts';
import { type Folders, resolveModel } from './resolve.ts';
import { modelText } from '../../reporters/model.ts';

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

const card = archetype('card')
  .identify({ marker: '{name}.dom.ts' })
  .contains((m, { self }) =>
    m
      .module('sub', dir('{name}'), self)
      .module('logic', files('*.ts'), exposes(all()))
      .module('dom', files('{name}.dom.ts'), exposes(all())),
  )
  .exposes((s) => ({ render: s.dom }));

const app = archetype('app').contains((m) =>
  m
    .module('domain', dir('src/domain'), exposes(all()))
    .module(
      'cards',
      dir('src/{name}'),
      card.using((s) => [s.domain]),
    )
    .module('main', files('src/main.ts')),
);

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

const { config } = loadConfigData({ root: app, tests: files('**/*.test.ts') });
const model = resolveModel(config, folders(paths), paths);
const judge = verdicts(config, model);

const verdict = (from: string, to: string): string => {
  const found = judge.verdict(from, to)!;
  if (found.allowed) return `allowed: ${grantText(found.grant)}`;
  return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
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
    const owners = paths.filter(model.isTest).map((file) => `${file} ${model.moduleOf(file)!.id}`);
    assert.deepEqual(owners, ['src/main.test.ts .', 'src/domain/order.test.ts src/domain', 'src/a/a.test.ts src/a']);
    assert.deepEqual(model.moduleOf('src/a/a.ts')!.id, 'src/a:logic');
    assert.deepEqual(
      model.modules.flatMap((module) => module.files),
      ['src/domain/order.ts', 'src/a/b/b.ts', 'src/a/b/b.dom.ts', 'src/a/a.ts', 'src/a/a.dom.ts', 'src/main.ts'],
    );
  });

  it("see their module's own files and modules, its children's surfaces, and what the module uses", () => {
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.ts'), 'allowed: tests of src/a');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/a.dom.ts'), 'allowed: tests of src/a');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.dom.ts'), 'allowed: tests of src/a uses src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/a/b/b.ts'), 'private to src/a/b');
    assert.equal(verdict('src/a/a.test.ts', 'src/domain/order.ts'), 'allowed: app.cards uses s.domain');
    assert.equal(verdict('src/main.test.ts', 'src/a/a.ts'), 'private to src/a');
  });

  it('are never imported by production code, while a test may import another test it reaches', () => {
    assert.equal(verdict('src/a/a.ts', 'src/a/a.test.ts'), 'test');
    assert.equal(verdict('src/main.test.ts', 'src/domain/order.test.ts'), 'private to src/domain');
    const findings = checkModel(
      config,
      model,
      { files: [facts('src/a/a.ts', [edge('src/a/a.ts', 'src/a/a.test.ts')])] },
      builtinRules,
    );
    assert.deepEqual(
      findings.map((finding) => finding.message),
      [
        'src/a/a.ts (logic of card src/a) imports src/a/a.test.ts (a test of card src/a), a test file. Production code never imports tests: move what both need out of the test file into the module it tests.',
      ],
    );
  });

  it('put no edge in a module cycle', () => {
    const findings = checkModel(
      config,
      model,
      {
        files: [
          facts('src/main.ts', [edge('src/main.ts', 'src/domain/order.ts')]),
          facts('src/domain/order.test.ts', [edge('src/domain/order.test.ts', 'src/main.ts')]),
        ],
      },
      builtinRules,
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
    assert.throws(
      () => loadConfigData({ root: app, tests: '**/*.test.ts' as never }),
      /config\.tests: expected the test entry files, files\('\*\*\/\*\.test\.ts', \.\.\.\)/,
    );
    assert.equal(loadConfigData({ root: app }).config.tests, undefined);
  });
});
