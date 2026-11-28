import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { Chain, FileFacts } from '../../domain/facts/facts.ts';
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

const order = 'domain/order.ts';

const uses = (name: string, line = 1): Chain => ({ line, root: { file: order, name }, hops: [], call: true });

const whole = (line = 1): Chain => ({ line, root: { file: order, name: '*' }, hops: [], call: false });

const through = (name: string, member: string | undefined, line = 1, root?: string): Chain => ({
  line,
  ...(root ? { root: { file: order, name: root } } : {}),
  hops: [{ file: order, name, ...(member ? { member } : {}) }],
  call: true,
});

const facts = (path: string, chains: Chain[] = []): FileFacts => ({
  path,
  lines: 1,
  imports: [],
  externals: [],
  unresolved: [],
  members: {
    members: [
      { name: 'cancel', kind: 'function', line: 4, endLine: 6 },
      { name: 'Order', kind: 'class', line: 8, endLine: 12 },
    ],
    links: [],
  },
  functions: [],
  classes: [],
  chains,
  exports: [],
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
  facts(order),
  facts('domain/policy.ts', [uses('cancel')]),
  facts('ui/cart/cart.ts', [uses('cancel', 3), through('refund', undefined, 3, '*'), whole(), uses('archive')]),
  facts('ui/orders/orders.ts', [uses('cancel'), through('Order', 'cancel', 2)]),
  facts('jobs/expire.ts', [uses('cancel', 2), uses('refund', 2), whole(), uses('archive')]),
  facts('jobs/archive.ts', [uses('refund'), through('Order', 'cancel')]),
  facts('app/main.ts', [
    uses('cancel', 5),
    uses('refund', 5),
    through('Order', 'cancel', 6, 'Order'),
    whole(7),
    { line: 8, root: { file: 'e2e.test.ts', name: 'fixture' }, hops: [], call: true },
  ]),
  facts('e2e.test.ts', [uses('cancel'), through('Order', 'cancel')]),
];

const run = (domain = '') => {
  const config = loadConfigData(parse(yaml(domain))).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [exportConsumers]);
};

describe('export-consumers', () => {
  it('counts the boundaries that use an exported value or a member of one, as the exporter sees them, leaving out tests and whole namespaces', () => {
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
      {
        rule: 'export-consumers',
        key: 'export-consumers:domain/order.ts#Order#cancel',
        file: 'domain/order.ts',
        line: 8,
        module: 'domain',
        value: 3,
        limit: 2,
        message:
          'Order#cancel, exported by domain, is used across 3 boundaries: app, jobs and ui. Its limit here is 2. Give ' +
          'its consumers one way in, or move it to a module meant to be shared and turn export-consumers off there.',
        sites: [
          { file: 'app/main.ts', line: 6 },
          { file: 'jobs/archive.ts', line: 1 },
          { file: 'ui/orders/orders.ts', line: 2 },
        ],
        parts: ['app', 'jobs', 'ui'],
        details: {
          module: 'domain',
          name: 'Order#cancel',
          consumers: [
            { module: 'ui', files: ['ui/orders/orders.ts'] },
            { module: 'jobs', files: ['jobs/archive.ts'] },
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
