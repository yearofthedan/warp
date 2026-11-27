import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { FileFacts, ImportEdge } from '../../domain/facts/facts.ts';
import { exportSurface } from './rule.ts';

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

const use = (to: string, names: string[], typeOnly = false): ImportEdge => ({
  from: '',
  to,
  specifier: to,
  names,
  typeOnly,
  line: 1,
});

const facts = (path: string, imports: ImportEdge[] = []): FileFacts => ({
  path,
  lines: 1,
  imports: imports.map((edge) => ({ ...edge, from: path })),
  externals: [],
  unresolved: [],
  members: { members: [{ name: 'cancel', kind: 'function', line: 4, endLine: 6 }], links: [] },
  functions: [],
  classes: [],
});

const yaml = (model: string) => `
root:
  ruleset: { rules: { export-surface: { max: 2 } } }
  modules:
    domain:
      dir: domain
      exposes: all
      modules:
        model: { dir: model, exposes: all${model} }
        rules: { dir: rules, exposes: all, dependencies: [model] }
    app: { dir: app, dependencies: [domain] }
  test: { modules: { tests: { files: '*.test.ts' } } }
`;

const project = [
  facts('domain/model/order.ts'),
  facts('domain/rules/rule.ts', [
    use('domain/model/order.ts', ['Order', 'cancel']),
    use('domain/model/order.ts', ['Price'], true),
  ]),
  facts('app/main.ts', [
    use('domain/model/order.ts', ['cancel']),
    use('domain/model/order.ts', ['Order'], true),
    use('domain/rules/rule.ts', ['run']),
  ]),
  facts('e2e.test.ts', [use('domain/model/order.ts', ['refund'])]),
];

const run = (model = '') => {
  const config = loadConfigData(parse(yaml(model))).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [exportSurface]);
};

describe('export-surface', () => {
  it('counts the names, values and types, that modules outside each module import from it, parents included', () => {
    assert.deepEqual(
      run().map(({ key, file, value, limit, message }) => ({ key, file, value, limit, message })),
      [
        {
          key: 'export-surface:domain',
          file: 'domain/model/order.ts',
          value: 3,
          limit: 2,
          message:
            'domain offers 3 names that other modules use (2 values, 1 type). Its limit here is 2. ' +
            'Split it, or give it a smaller front.',
        },
        {
          key: 'export-surface:domain/model',
          file: 'domain/model/order.ts',
          value: 3,
          limit: 2,
          message:
            'domain/model offers 3 names that other modules use (2 values, 1 type). Its limit here is 2. ' +
            'Split it, or give it a smaller front.',
        },
      ],
    );
  });

  it('judges each module against its own ruleset', () => {
    assert.deepEqual(
      run(', ruleset: { rules: { export-surface: { max: 3 } } }').map(({ key }) => key),
      ['export-surface:domain'],
    );
  });
});
