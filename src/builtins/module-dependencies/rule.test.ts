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

const use = (to: string, names: string[], line = 1, via?: string): ImportEdge => ({
  from: '',
  to,
  specifier: via ?? to,
  names,
  typeOnly: false,
  line,
  ...(via ? { via } : {}),
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
    strings: { dir: strings, exposes: all, dependencies: [icons] }
    shell:
      dir: shell
      dependencies: [domain, strings]
      ruleset: { rules: { module-dependencies: { max: 1 } } }
    ui:
      dir: ui
      dependencies: [domain, icons, strings]${ui}
      modules:
        card: { dir: card, exposes: all, dependencies: [theme] }
        theme: { dir: theme, exposes: all }
  test: { modules: { tests: { files: '*.test.ts' } } }
`;

const project = [
  facts('domain/order.ts'),
  facts('domain/rules.ts', [use('domain/order.ts', ['Order'])]),
  facts('icons/icons.ts'),
  facts('strings/strings.ts', [use('icons/icons.ts', ['icon'])]),
  facts('shell/main.ts', [
    use('icons/icons.ts', ['icon'], 7, 'strings/strings.ts'),
    use('domain/order.ts', ['Order'], 8),
  ]),
  facts('ui/card/card.ts', [
    use('domain/order.ts', ['Order'], 3),
    use('icons/icons.ts', ['icon'], 2),
    use('strings/strings.ts', ['strings'], 5),
    use('ui/theme/theme.ts', ['theme'], 9),
    use('fixture.test.ts', ['fixture'], 6),
  ]),
  facts('ui/theme/theme.ts'),
  facts('ui/page.ts', [use('ui/card/card.ts', ['card']), use('domain/order.ts', ['cancel'], 1)]),
  facts('fixture.test.ts', [use('icons/icons.ts', ['icon'])]),
  facts('e2e.test.ts', [use('ui/page.ts', ['page']), use('domain/order.ts', ['cancel'])]),
];

const run = (ui = '') => {
  const config = loadConfigData(parse(yaml(ui)), { builtins: { rules: [moduleDependencies] } }).config;
  const paths = project.map((file) => file.path);
  return checkModel(config, resolveModel(config, folders(paths), paths), { files: project }, [moduleDependencies]);
};

describe('module-dependencies', () => {
  it('counts the boundaries a module imports across, through the barrel it names, judging parents too', () => {
    assert.deepEqual(run(), [
      {
        rule: 'module-dependencies',
        key: 'module-dependencies:shell',
        file: 'shell/main.ts',
        line: 7,
        value: 2,
        limit: 1,
        message:
          'shell imports across 2 boundaries: domain and strings. Its limit here is 1. Split it along what each part depends on, or reach some of them through one module. A module meant to wire everything together, such as a composition root, turns module-dependencies off or raises its max.',
        sites: [
          {
            file: 'shell/main.ts',
            line: 7,
          },
          {
            file: 'shell/main.ts',
            line: 8,
          },
        ],
        parts: ['domain', 'strings'],
        details: {
          module: 'shell',
          boundaries: [
            {
              module: 'strings',
              files: ['shell/main.ts'],
            },
            {
              module: 'domain',
              files: ['shell/main.ts'],
            },
          ],
        },
        module: 'shell',
      },
      {
        rule: 'module-dependencies',
        key: 'module-dependencies:ui',
        file: 'ui/card/card.ts',
        line: 2,
        value: 3,
        limit: 2,
        message:
          'ui imports across 3 boundaries: domain, icons and strings. Its limit here is 2. Split it along what each part depends on, or reach some of them through one module. A module meant to wire everything together, such as a composition root, turns module-dependencies off or raises its max.',
        sites: [
          {
            file: 'ui/card/card.ts',
            line: 2,
          },
          {
            file: 'ui/card/card.ts',
            line: 3,
          },
          {
            file: 'ui/card/card.ts',
            line: 5,
          },
        ],
        parts: ['domain', 'icons', 'strings'],
        details: {
          module: 'ui',
          boundaries: [
            {
              module: 'domain',
              files: ['ui/card/card.ts', 'ui/page.ts'],
            },
            {
              module: 'icons',
              files: ['ui/card/card.ts'],
            },
            {
              module: 'strings',
              files: ['ui/card/card.ts'],
            },
          ],
        },
        module: 'ui/card',
      },
      {
        rule: 'module-dependencies',
        key: 'module-dependencies:ui/card',
        file: 'ui/card/card.ts',
        line: 2,
        value: 4,
        limit: 2,
        message:
          'ui/card imports across 4 boundaries: domain, icons, strings and ui/theme. Its limit here is 2. Split it along what each part depends on, or reach some of them through one module. A module meant to wire everything together, such as a composition root, turns module-dependencies off or raises its max.',
        sites: [
          {
            file: 'ui/card/card.ts',
            line: 2,
          },
          {
            file: 'ui/card/card.ts',
            line: 3,
          },
          {
            file: 'ui/card/card.ts',
            line: 5,
          },
          {
            file: 'ui/card/card.ts',
            line: 9,
          },
        ],
        parts: ['domain', 'icons', 'strings', 'ui/theme'],
        details: {
          module: 'ui/card',
          boundaries: [
            {
              module: 'domain',
              files: ['ui/card/card.ts'],
            },
            {
              module: 'icons',
              files: ['ui/card/card.ts'],
            },
            {
              module: 'strings',
              files: ['ui/card/card.ts'],
            },
            {
              module: 'ui/theme',
              files: ['ui/card/card.ts'],
            },
          ],
        },
        module: 'ui/card',
      },
    ]);
  });

  it('leaves out what the ruleset where it is judged ignores, named from where that ruleset is written', () => {
    assert.deepEqual(
      run('\n      ruleset: { rules: { module-dependencies: { ignore: [icons, theme] } } }').map(({ key }) => key),
      ['module-dependencies:shell'],
    );
  });

  it('skips modules where it is off', () => {
    assert.deepEqual(
      run('\n      ruleset: { rules: { module-dependencies: off } }').map(({ key }) => key),
      ['module-dependencies:shell'],
    );
  });
});
