import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { FileFacts } from '../../domain/facts/facts.ts';
import { moduleSize } from './rule.ts';

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

const facts = (path: string, lines: number): FileFacts => ({
  path,
  lines,
  imports: [],
  externals: [],
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
  classes: [],
  chains: [],
  exports: [],
});

const yaml = `
root:
  ruleset: { rules: { module-size: { max: 100 } } }
  modules:
    domain:
      dir: domain
      modules:
        model: { dir: model }
        rules: { dir: rules, ruleset: { rules: { module-size: { max: 200 } } } }
        price: { dir: price, ruleset: { rules: { module-size: off } } }
  test: { modules: { tests: { files: '**/*.test.ts' } } }
`;

const project = [
  facts('domain/index.ts', 100),
  facts('domain/model/order.ts', 60),
  facts('domain/model/price.ts', 50),
  facts('domain/model/money.ts', 50),
  facts('domain/price/price.ts', 900),
  facts('domain/model/order.test.ts', 500),
  facts('domain/rules/rule.ts', 150),
];

describe('module-size', () => {
  it("totals the production lines in a module's own files, leaving its children's files to them, judged by its own ruleset, up to and including its max", () => {
    const config = loadConfigData(parse(yaml)).config;
    const paths = project.map((file) => file.path);
    const findings = checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [moduleSize]);
    assert.deepEqual(findings, [
      {
        rule: 'module-size',
        key: 'module-size:domain/model',
        file: 'domain/model/order.ts',
        line: 1,
        module: 'domain/model',
        value: 160,
        limit: 100,
        message:
          'domain/model holds 160 lines in its own files (limit 100): domain/model/order.ts 60, ' +
          'domain/model/money.ts 50, domain/model/price.ts 50. Split it into modules that each hold one responsibility.',
        details: {
          module: 'domain/model',
          files: [
            { file: 'domain/model/order.ts', lines: 60 },
            { file: 'domain/model/money.ts', lines: 50 },
            { file: 'domain/model/price.ts', lines: 50 },
          ],
        },
      },
    ]);
  });
});
