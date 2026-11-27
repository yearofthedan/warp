import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { ConfigError } from './configError.ts';
import { compileConfig } from '../language/compile.ts';
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
  const yaml = `
root:
  modules:
    lib: { dir: src, archetype: lib }
    tooling: { files: 'scripts/*.ts', dependencies: [lib] }
archetypes:
  lib:
    entry: index.ts
    modules:
      core: { dir: core, exposes: all }
      hidden: { dir: hidden }
      cli: { files: '*.ts', dependencies: [core] }
`;
  const paths = [
    'src/index.ts',
    'src/cli.ts',
    'src/stray/x.ts',
    'src/core/a.ts',
    'src/hidden/b.ts',
    'scripts/build.ts',
  ];
  const config = compileConfig(parse(yaml));
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
      { entry: 'allowed: tooling uses lib', core: 'private to src', cli: 'private to src:cli' },
    );
  });

  it('reaches what its own modules expose, and nothing they keep private', () => {
    const { verdict } = repoWithEntry();
    assert.deepEqual(
      { core: verdict('src/index.ts', 'src/core/a.ts'), hidden: verdict('src/index.ts', 'src/hidden/b.ts') },
      { core: 'allowed: src uses src/core', hidden: 'private to src/hidden' },
    );
  });

  it('refuses an entry beside exposes, and an entry on a files module or a test module', () => {
    const failures = (yaml: string): string[] => {
      try {
        compileConfig(parse(yaml));
      } catch (error) {
        assert.ok(error instanceof ConfigError);
        return error.message.split('\n');
      }
      assert.fail('expected a ConfigError');
    };
    assert.deepEqual(failures('root: { modules: { x: { dir: x, entry: index.ts, exposes: all } } }'), [
      "root.x.exposes: an entry is the module's whole surface; give it entry or exposes",
    ]);
    assert.deepEqual(failures('root: { modules: { x: { files: x.ts, entry: x.ts } } }'), [
      'root.x.entry: a files module has no modules; use dir for a folder of them',
    ]);
    assert.deepEqual(failures('root: { test: { modules: { x: { files: x.test.ts, entry: x.ts } } } }'), [
      'root.x: unknown key entry; a module takes description, dir, files, archetype, dependencies, exposes, modules',
    ]);
  });
});
