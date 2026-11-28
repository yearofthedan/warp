import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { ExternalImport, FileFacts } from '../../domain/facts/facts.ts';
import { packageSpread } from './rule.ts';

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

const imports = (specifier: string, line = 1, more: Partial<ExternalImport> = {}): ExternalImport => ({
  from: '',
  package: specifier.split('/')[0]!,
  specifier,
  names: ['x'],
  typeOnly: false,
  line,
  ...more,
});

const facts = (path: string, externals: ExternalImport[] = []): FileFacts => ({
  path,
  lines: 1,
  imports: [],
  externals: externals.map((external) => ({ ...external, from: path })),
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
  classes: [],
  chains: [],
});

const yaml = (features: string) => `
root:
  ruleset: { rules: { package-spread: on } }
  modules:
    features:
      dir: features${features}
      modules:
        billing: { dir: billing, dependencies: ['npm:*'] }
        checkout: { dir: checkout, dependencies: ['npm:*'] }
        refunds: { dir: refunds, dependencies: ['npm:*'] }
        shell: { files: shell.ts, dependencies: ['npm:*', 'node:*'] }
      test: { modules: { tests: { dir: tests, dependencies: ['npm:*'] } } }
`;

const project = [
  facts('features/refunds/refund.ts', [imports('stripe', 2), imports('zod', 1, { typeOnly: true })]),
  facts('features/index.ts', [imports('stripe')]),
  facts('features/billing/pay.ts', [imports('stripe', 3), imports('zod')]),
  facts('features/billing/invoice.ts', [imports('stripe/types', 2)]),
  facts('features/checkout/cart.ts', [imports('stripe', 4), imports('zod'), imports('node:fs')]),
  facts('features/shell.ts', [imports('zod', 1, { reExport: true }), imports('node:fs')]),
  facts('features/tests/pay.ts', [imports('zod')]),
];

const run = (features = '') => {
  const config = loadConfigData(parse(yaml(features)), { builtins: { rules: [packageSpread] } }).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [packageSpread]);
};

describe('package-spread', () => {
  it("counts a module's children that import one package, leaving out type-only imports, re-exports and tests", () => {
    assert.deepEqual(run(), [
      {
        rule: 'package-spread',
        key: 'package-spread:features:stripe',
        file: 'features/billing/pay.ts',
        line: 3,
        module: 'features/billing',
        value: 3,
        limit: 2,
        message:
          "3 of features's modules import stripe: features/billing, features/checkout and features/refunds. " +
          'Its limit here is 2. Wrap stripe in the one module that should own it and let the others go through ' +
          "that module, or name npm:stripe in package-spread's ignore on features if it is meant to be used everywhere.",
        sites: [
          { file: 'features/billing/pay.ts', line: 3 },
          { file: 'features/checkout/cart.ts', line: 4 },
          { file: 'features/refunds/refund.ts', line: 2 },
        ],
        parts: ['features/billing', 'features/checkout', 'features/refunds'],
        details: {
          module: 'features',
          package: 'stripe',
          children: [
            { module: 'features/refunds', files: ['features/refunds/refund.ts'] },
            { module: 'features/billing', files: ['features/billing/pay.ts', 'features/billing/invoice.ts'] },
            { module: 'features/checkout', files: ['features/checkout/cart.ts'] },
          ],
        },
      },
    ]);
  });

  it('counts a files module as a child, node: built-ins too, and judges only modules with children where the rule is on', () => {
    assert.deepEqual(
      run('\n      ruleset: { rules: { package-spread: { max: 1 } } }').map(({ key, value }) => [key, value]),
      [
        ['package-spread:features:stripe', 3],
        ['package-spread:features:zod', 2],
        ['package-spread:features:node:fs', 2],
      ],
    );
    assert.deepEqual(run('\n      ruleset: { rules: { package-spread: off } }'), []);
  });

  it('leaves out the packages the judged module ignores, written as dependencies writes them', () => {
    const at = (ignore: string) =>
      run(`\n      ruleset: { rules: { package-spread: { max: 1, ignore: ${ignore} } } }`).map(({ key }) => key);
    assert.deepEqual(at('[npm:stripe, node:fs]'), ['package-spread:features:zod']);
    assert.deepEqual(at("['npm:*', 'node:*']"), []);
  });

  it('refuses an ignore that is not a list of packages', () => {
    for (const ignore of ['[stripe]', 'npm:stripe', '[3]'])
      assert.throws(() => run(`\n      ruleset: { rules: { package-spread: { ignore: ${ignore} } } }`), {
        name: 'ConfigError',
        message:
          /^root\.features\.ruleset\.rules\.package-spread\.ignore: expected a list of packages, as dependencies names them: \[npm:zod, 'node:\*'\]$/,
      });
  });
});
