import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { FileFacts, ImportEdge } from '../../domain/facts/facts.ts';
import { exportConsumers } from './rule.ts';

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

const use = (to: string, names: string[], typeOnly = false, line = 1): ImportEdge => ({
  from: '',
  to,
  specifier: to,
  names,
  typeOnly,
  line,
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

const yaml = (domain: string) => `
root:
  ruleset: { rules: { export-consumers: { max: 2 } } }
  modules:
    domain: { dir: domain, exposes: all${domain} }
    ui:
      dir: ui
      modules:
        cart: { dir: cart, dependencies: [domain] }
        orders: { dir: orders, dependencies: [domain] }
    jobs: { dir: jobs, dependencies: [domain] }
    app: { dir: app, dependencies: [domain] }
  test: { modules: { tests: { files: '*.test.ts' } } }
`;

const project = [
  facts('domain/order.ts'),
  facts('domain/policy.ts', [use('domain/order.ts', ['cancel'])]),
  facts('ui/cart/cart.ts', [use('domain/order.ts', ['cancel', 'refund'], false, 3)]),
  facts('ui/orders/orders.ts', [
    use('domain/order.ts', ['cancel', 'Order']),
    use('domain/order.ts', ['OrderId'], true),
  ]),
  facts('jobs/expire.ts', [use('domain/order.ts', ['cancel', 'refund'], false, 2)]),
  facts('jobs/archive.ts', [use('domain/order.ts', ['refund'])]),
  facts('app/main.ts', [
    use('domain/order.ts', ['cancel', 'Order', 'refund'], false, 5),
    use('domain/order.ts', ['OrderId'], true),
  ]),
  facts('e2e.test.ts', [use('domain/order.ts', ['cancel', 'Order'])]),
];

const run = (domain = '') => {
  const config = loadConfigData(parse(yaml(domain))).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [exportConsumers]);
};

describe('export-consumers', () => {
  it('counts the boundaries that use an exported value, as the exporter sees them, leaving out types and tests', () => {
    assert.deepEqual(run(), [
      {
        rule: 'export-consumers',
        key: 'export-consumers:domain/order.ts#cancel',
        file: 'domain/order.ts',
        line: 4,
        module: 'domain',
        value: 3,
        limit: 2,
        message:
          'cancel, exported by domain, is used across 3 boundaries: app, jobs and ui. Its limit here is 2. Give its ' +
          'consumers one way in, or move it to a module meant to be shared and turn export-consumers off there.',
        sites: [
          { file: 'app/main.ts', line: 5 },
          { file: 'jobs/expire.ts', line: 2 },
          { file: 'ui/cart/cart.ts', line: 3 },
        ],
        parts: ['app', 'jobs', 'ui'],
        details: {
          module: 'domain',
          name: 'cancel',
          consumers: [
            { module: 'ui', files: ['ui/cart/cart.ts', 'ui/orders/orders.ts'] },
            { module: 'jobs', files: ['jobs/expire.ts'] },
            { module: 'app', files: ['app/main.ts'] },
          ],
        },
      },
      {
        rule: 'export-consumers',
        key: 'export-consumers:domain/order.ts#refund',
        file: 'domain/order.ts',
        line: 1,
        module: 'domain',
        value: 3,
        limit: 2,
        message:
          'refund, exported by domain, is used across 3 boundaries: app, jobs and ui. Its limit here is 2. Give its ' +
          'consumers one way in, or move it to a module meant to be shared and turn export-consumers off there.',
        sites: [
          { file: 'app/main.ts', line: 5 },
          { file: 'jobs/expire.ts', line: 2 },
          { file: 'ui/cart/cart.ts', line: 3 },
        ],
        parts: ['app', 'jobs', 'ui'],
        details: {
          module: 'domain',
          name: 'refund',
          consumers: [
            { module: 'ui', files: ['ui/cart/cart.ts'] },
            { module: 'jobs', files: ['jobs/expire.ts', 'jobs/archive.ts'] },
            { module: 'app', files: ['app/main.ts'] },
          ],
        },
      },
    ]);
  });

  it("reads the exporter's ruleset, so a module meant to be shared turns it off once", () => {
    assert.deepEqual(run(', ruleset: { rules: { export-consumers: off } }'), []);
  });
});
