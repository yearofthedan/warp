import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { FileFacts, ImportEdge } from '../../domain/facts/facts.ts';
import { exportSpread } from './rule.ts';

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
  chains: [],
});

const yaml = (ui: string) => `
root:
  ruleset: { rules: { export-spread: on } }
  modules:
    domain: { dir: domain, exposes: all }
    strings: { dir: strings, exposes: all }
    ui:
      dir: ui${ui}
      modules:
        cart: { dir: cart, dependencies: [domain, strings] }
        orders: { dir: orders, dependencies: [domain, strings] }
        account: { dir: account, dependencies: [domain, strings] }
        shell: { files: shell.ts, dependencies: [domain, strings] }
      test: { modules: { tests: { dir: tests, dependencies: [domain, strings] } } }
`;

const project = [
  facts('domain/order.ts'),
  facts('strings/strings.ts'),
  facts('ui/cart/cart.ts', [use('domain/order.ts', ['cancel']), use('strings/strings.ts', ['strings'], false, 4)]),
  facts('ui/cart/badge.ts', [use('domain/order.ts', ['cancel']), use('strings/strings.ts', ['strings'], false, 2)]),
  facts('ui/orders/orders.ts', [
    use('domain/order.ts', ['cancel', 'OrderId'], true),
    use('strings/strings.ts', ['strings'], false, 3),
  ]),
  facts('ui/account/account.ts', [use('strings/strings.ts', ['strings'], false, 2)]),
  facts('ui/shell.ts', [use('domain/order.ts', ['cancel'])]),
  facts('ui/tests/cart.ts', [use('domain/order.ts', ['cancel'])]),
];

const run = (ui = '') => {
  const config = loadConfigData(parse(yaml(ui)), { builtins: { rules: [exportSpread] } }).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [exportSpread]);
};

describe('export-spread', () => {
  it("counts a module's children that use one outside value, leaving out type-only uses and test modules", () => {
    assert.deepEqual(run(), [
      {
        rule: 'export-spread',
        key: 'export-spread:ui:strings/strings.ts#strings',
        file: 'ui/account/account.ts',
        line: 2,
        module: 'ui/account',
        value: 3,
        limit: 2,
        message:
          "3 of ui's modules use strings from strings: ui/account, ui/cart and ui/orders. Its limit here is 2. " +
          'Give the use to the one module that should own it and let the others go through that module, or name ' +
          "it in export-spread's ignore on ui if it is meant to be shared.",
        sites: [
          { file: 'ui/account/account.ts', line: 2 },
          { file: 'ui/cart/cart.ts', line: 4 },
          { file: 'ui/orders/orders.ts', line: 3 },
        ],
        parts: ['ui/account', 'ui/cart', 'ui/orders'],
        details: {
          module: 'ui',
          exporter: 'strings',
          file: 'strings/strings.ts',
          name: 'strings',
          children: [
            { module: 'ui/cart', files: ['ui/cart/cart.ts', 'ui/cart/badge.ts'] },
            { module: 'ui/orders', files: ['ui/orders/orders.ts'] },
            { module: 'ui/account', files: ['ui/account/account.ts'] },
          ],
        },
      },
    ]);
  });

  it('counts a files module as a child, and judges only modules with children where the rule is on', () => {
    assert.deepEqual(
      run('\n      ruleset: { rules: { export-spread: { max: 1 } } }').map(({ key, value }) => [key, value]),
      [
        ['export-spread:ui:domain/order.ts#cancel', 2],
        ['export-spread:ui:strings/strings.ts#strings', 3],
      ],
    );
    assert.deepEqual(run('\n      ruleset: { rules: { export-spread: off } }'), []);
  });

  it("leaves out what the judged module's ruleset ignores", () => {
    assert.deepEqual(run('\n      ruleset: { rules: { export-spread: { ignore: [strings] } } }'), []);
  });

  it('names modules as dependencies do, from where the ruleset is written, and refuses one not in scope', () => {
    assert.throws(() => run('\n      ruleset: { rules: { export-spread: { ignore: [string] } } }'), {
      name: 'ConfigError',
      message:
        /^root\.ui\.ruleset\.rules\.export-spread\.ignore: 'string': no module or input called string here; in scope: account, cart, domain, orders, shell, strings, tests, ui$/,
    });
  });
});
