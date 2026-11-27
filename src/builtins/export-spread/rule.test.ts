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

const yaml = (ui: string) => `
root:
  ruleset: { rules: { export-spread: on } }
  modules:
    domain: { dir: domain, exposes: all }
    strings: { dir: strings, exposes: all }
    ui:
      dir: ui
      dependencies: [domain, strings]${ui}
      modules:
        cart: { dir: cart, dependencies: [domain, strings] }
        orders: { dir: orders, dependencies: [domain, strings] }
        account: { dir: account, dependencies: [domain, strings] }
`;

const project = [
  facts('domain/order.ts'),
  facts('strings/strings.ts'),
  facts('ui/cart/cart.ts', [use('domain/order.ts', ['cancel']), use('strings/strings.ts', ['strings'])]),
  facts('ui/cart/badge.ts', [use('domain/order.ts', ['cancel'])]),
  facts('ui/orders/orders.ts', [
    use('domain/order.ts', ['cancel', 'OrderId'], true),
    use('strings/strings.ts', ['strings']),
  ]),
  facts('ui/account/account.ts', [use('domain/order.ts', ['cancel']), use('strings/strings.ts', ['strings'])]),
];

const run = (ui = '') => {
  const config = loadConfigData(parse(yaml(ui)), { builtins: { rules: [exportSpread] } }).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [exportSpread]);
};

describe('export-spread', () => {
  it("counts a module's children that use one outside value, leaving out type-only uses", () => {
    assert.deepEqual(
      run().map(({ key, file, line, value, limit, parts, message }) => ({
        key,
        file,
        line,
        value,
        limit,
        parts,
        message,
      })),
      [
        {
          key: 'export-spread:ui:strings/strings.ts#strings',
          file: 'ui/account/account.ts',
          line: 1,
          value: 3,
          limit: 2,
          parts: ['ui/account', 'ui/cart', 'ui/orders'],
          message:
            "3 of ui's modules use strings from strings: ui/account, ui/cart and ui/orders. Its limit here is 2. " +
            'Give the use to the one module that should own it and let the others go through that module, or name ' +
            "it in export-spread's ignore on ui if it is meant to be shared.",
        },
      ],
    );
  });

  it("leaves out what the judged module's ruleset ignores", () => {
    assert.deepEqual(run('\n      ruleset: { rules: { export-spread: { ignore: [strings] } } }'), []);
  });

  it('names modules as dependencies do, from where the ruleset is written, and refuses one not in scope', () => {
    assert.throws(() => run('\n      ruleset: { rules: { export-spread: { ignore: [string] } } }'), {
      name: 'ConfigError',
      message:
        /^root\.ui\.ruleset\.rules\.export-spread\.ignore: 'string': no module or input called string here; in scope: account, cart, domain, orders, strings, ui$/,
    });
  });
});
