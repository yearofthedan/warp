import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import type { FileFacts, ImportEdge } from '../../domain/facts/facts.ts';
import { moduleDependencies } from './rule.ts';

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
  ruleset: { rules: { module-dependencies: { max: 2 } } }
  modules:
    domain: { dir: domain, exposes: all }
    icons: { dir: icons, exposes: all }
    strings: { dir: strings, exposes: all }
    ui:
      dir: ui
      dependencies: [domain, icons, strings]${ui}
      modules:
        card: { dir: card, exposes: all }
  test: { modules: { tests: { files: '*.test.ts' } } }
`;

const project = [
  facts('domain/order.ts'),
  facts('domain/rules.ts', [use('domain/order.ts', ['Order'], true)]),
  facts('icons/icons.ts'),
  facts('strings/strings.ts'),
  facts('ui/card/card.ts', [
    use('domain/order.ts', ['Order'], true),
    use('icons/icons.ts', ['icon']),
    use('strings/strings.ts', ['strings']),
  ]),
  facts('ui/page.ts', [use('ui/card/card.ts', ['card'])]),
  facts('e2e.test.ts', [use('ui/page.ts', ['page']), use('domain/order.ts', ['cancel'])]),
];

const run = (ui = '') => {
  const config = loadConfigData(parse(yaml(ui)), { builtins: { rules: [moduleDependencies] } }).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [moduleDependencies]);
};

describe('module-dependencies', () => {
  it('counts the boundaries a module imports across, types included, judging parents too', () => {
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
          key: 'module-dependencies:ui',
          file: 'ui/card/card.ts',
          line: 1,
          value: 3,
          limit: 2,
          parts: ['domain', 'icons', 'strings'],
          message:
            'ui imports across 3 boundaries: domain, icons and strings. Its limit here is 2. Split it along what each ' +
            'part depends on, or reach some of them through one module. A module meant to wire everything together, ' +
            'such as a composition root, turns module-dependencies off or raises its max.',
        },
        {
          key: 'module-dependencies:ui/card',
          file: 'ui/card/card.ts',
          line: 1,
          value: 3,
          limit: 2,
          parts: ['domain', 'icons', 'strings'],
          message:
            'ui/card imports across 3 boundaries: domain, icons and strings. Its limit here is 2. Split it along what ' +
            'each part depends on, or reach some of them through one module. A module meant to wire everything ' +
            'together, such as a composition root, turns module-dependencies off or raises its max.',
        },
      ],
    );
  });

  it('leaves out what the ruleset where it is judged ignores, inherited from above', () => {
    assert.deepEqual(run('\n      ruleset: { rules: { module-dependencies: { ignore: [icons] } } }'), []);
  });
});
