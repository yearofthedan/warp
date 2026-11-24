import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { all, archetype, dir, exposes, files, using } from './builder.ts';
import { ConfigError } from '../configError.ts';
import { loadConfigData } from '../../app/load.ts';
import { grantText, verdicts } from './reach.ts';
import { type Folders, resolveModel } from './resolve.ts';

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

const repoWithEntry = () => {
  const lib = archetype('lib')
    .contains((m) =>
      m
        .module('core', dir('core'), exposes(all()))
        .module('hidden', dir('hidden'))
        .module(
          'cli',
          files('*.ts'),
          using((m) => [m.core]),
        ),
    )
    .entry(files('index.ts'));

  const repo = archetype('repo').contains((m) =>
    m.module('lib', dir('src'), lib).module(
      'tooling',
      files('scripts/*.ts'),
      using((m) => [m.lib]),
    ),
  );

  const paths = [
    'src/index.ts',
    'src/cli.ts',
    'src/stray/x.ts',
    'src/core/a.ts',
    'src/hidden/b.ts',
    'scripts/build.ts',
  ];
  const { config } = loadConfigData({ root: repo });
  const model = resolveModel(config, folders(paths), paths);
  const judge = verdicts(config, model);

  const verdict = (from: string, to: string): string => {
    const found = judge.verdict(from, to)!;
    if (found.allowed) return `allowed: ${grantText(found.grant)}`;
    return found.reason === 'private' ? `private to ${found.hiddenBy.id}` : found.reason;
  };
  return { model, verdict };
};

describe('a module entry', () => {
  it('belongs to its folder module, ahead of a files module that also matches it, and is never loose', () => {
    const { model } = repoWithEntry();
    assert.equal(model.moduleOf('src/index.ts')!.id, 'src');
    assert.equal(model.moduleOf('src/cli.ts')!.id, 'src:cli');
    assert.deepEqual(model.moduleOf('src/index.ts')!.looseFiles, ['src/stray/x.ts']);
  });

  it("is the module's whole surface", () => {
    const { verdict } = repoWithEntry();
    assert.deepEqual(
      {
        entry: verdict('scripts/build.ts', 'src/index.ts'),
        core: verdict('scripts/build.ts', 'src/core/a.ts'),
        cli: verdict('scripts/build.ts', 'src/cli.ts'),
      },
      { entry: 'allowed: tooling uses m.lib', core: 'private to src', cli: 'private to src:cli' },
    );
  });

  it('reaches what its own modules expose, and nothing they keep private', () => {
    const { verdict } = repoWithEntry();
    assert.deepEqual(
      { core: verdict('src/index.ts', 'src/core/a.ts'), hidden: verdict('src/index.ts', 'src/hidden/b.ts') },
      { core: 'allowed: src uses src/core', hidden: 'private to src/hidden' },
    );
  });

  it('refuses an entry beside exposes, an entry that is not files, and an entry on a files module or test module', () => {
    const failures = (root: unknown): string[] => {
      try {
        loadConfigData({ root });
      } catch (error) {
        assert.ok(error instanceof ConfigError);
        return error.message.split('\n');
      }
      assert.fail('expected a ConfigError');
    };
    const both = archetype('both').entry(files('index.ts')).exposes(all());
    const notFiles = archetype('notFiles').entry(dir('x') as never);
    const onFiles = archetype('onFiles').contains((m) =>
      m.module('x', files('x.ts'), using([]).entry(files('x.ts')) as never),
    );
    const onTest = archetype('onTest').contains((m) =>
      m.testModule('x', files('x.test.ts'), using([]).entry(files('x.ts')) as never),
    );
    assert.deepEqual(
      [both, notFiles, onFiles, onTest].flatMap((root) => failures(root)),
      [
        "both: an entry is the module's whole surface; give it .entry(...) or .exposes(...)",
        "notFiles.entry: expected the module's entry files, files('index.ts')",
        'onFiles.x.entry: a files module has no modules; use dir(...) for entry',
        'onTest.x.entry: a test module holds test code; its archetype takes using(...), exposes(...) and description(...)',
      ],
    );
  });
});
