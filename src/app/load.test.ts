import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { ConfigError } from '../model/configError.ts';
import { type FileRule, wholeNumberOptions } from '../rules/rule.ts';
import { type LoadOptions, loadConfigData } from './load.ts';
import { builtinRegistry } from '../builtins/index.ts';

const load = (yaml: string, options?: LoadOptions) => loadConfigData(parse(yaml), options);

const failures = (yaml: string, options?: LoadOptions): string[] => {
  try {
    load(yaml, options);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  assert.fail('expected a ConfigError');
};

const shop = `
root:
  description: A shop
  modules:
    domain: { dir: src/domain, exposes: all }
    ui: { dir: src/ui, archetype: ui, dependencies: { domain: domain, react: npm:react } }
    main: { files: src/main.ts, dependencies: [ui.render, 'node:*'] }
  test:
    provides: [npm:vitest]
    modules:
      e2e: { dir: e2e }
archetypes:
  ui:
    requires: [domain, react]
    exposes: [render]
    modules:
      cards: { dir: '*', archetype: card, dependencies: [domain] }
      render: { files: '*.tsx', exposes: all, dependencies: [cards, react] }
  card:
    marker: '{name}.tsx'
    requires: [domain]
    entry: index.ts
    modules:
      logic: { files: '*.ts', dependencies: [domain] }
    test:
      modules:
        tests: { files: '*.test.ts', dependencies: [npm:vitest] }
`;

describe('loadConfigData', () => {
  it('turns the language into plain data: dependencies, inputs, surfaces, an entry, a marker and a test kit', () => {
    assert.deepEqual(load(shop).config, {
      file: 'warp.yaml',
      root: 'root',
      archetypes: {
        ui: {
          name: 'ui',
          requires: ['domain', 'react'],
          modules: [
            {
              kind: 'dir',
              name: 'cards',
              paths: ['{name}'],
              archetype: 'card',
              using: [{ kind: 'required', name: 'domain' }],
              inputs: { domain: { kind: 'required', name: 'domain' } },
            },
            {
              kind: 'files',
              name: 'render',
              patterns: ['*.tsx'],
              using: [
                { kind: 'module', module: 'cards' },
                { kind: 'required', name: 'react' },
              ],
              exposes: { kind: 'all' },
            },
          ],
          exposes: { kind: 'surfaces', surfaces: { render: [{ kind: 'module', module: 'render' }] } },
        },
        card: {
          name: 'card',
          requires: ['domain'],
          modules: [
            { kind: 'files', name: 'logic', patterns: ['*.ts'], using: [{ kind: 'required', name: 'domain' }] },
            { kind: 'test', name: 'tests', patterns: ['*.test.ts'], using: [{ kind: 'package', pattern: 'vitest' }] },
          ],
          identify: { marker: '{name}.tsx' },
          exposes: { kind: 'files', patterns: ['index.ts'], entry: true },
        },
        root: {
          name: 'root',
          description: 'A shop',
          requires: [],
          modules: [
            { kind: 'dir', name: 'domain', paths: ['src/domain'], archetype: 'root.domain', using: [] },
            {
              kind: 'dir',
              name: 'ui',
              paths: ['src/ui'],
              archetype: 'ui',
              using: [
                { kind: 'module', module: 'domain' },
                { kind: 'package', pattern: 'react' },
              ],
              inputs: {
                domain: { kind: 'module', module: 'domain' },
                react: { kind: 'package', pattern: 'react' },
              },
            },
            {
              kind: 'files',
              name: 'main',
              patterns: ['src/main.ts'],
              using: [
                { kind: 'module', module: 'ui', surface: 'render' },
                { kind: 'package', pattern: 'node:*' },
              ],
            },
            { kind: 'dir', name: 'e2e', paths: ['e2e'], archetype: 'root.e2e', test: true, using: [] },
          ],
          testUsing: [{ kind: 'package', pattern: 'vitest' }],
        },
        'root.domain': { name: 'root.domain', inline: true, requires: [], modules: [], exposes: { kind: 'all' } },
        'root.e2e': { name: 'root.e2e', inline: true, test: true, requires: [], modules: [] },
      },
      tsconfig: ['tsconfig.json'],
      rules: 'off',
    });
  });

  it('names a sibling first, then a module above inside the same archetype, and with top. the outermost', () => {
    const { config } = load(`
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    core: { dir: src/core, exposes: all }
    app:
      dir: src/app
      exposes: all
      modules:
        core: { dir: core, exposes: all }
        store: { files: store.ts, dependencies: [core, domain, top.core] }
`);
    assert.deepEqual(config.archetypes['root.app']!.modules[1]!.using, [
      { kind: 'module', module: 'core' },
      { kind: 'module', module: 'domain', up: 1 },
      { kind: 'module', module: 'core', up: 1 },
    ]);
  });

  it('refuses a name that is nowhere in scope, listing what is', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    main: { files: main.ts, dependencies: [domian, domain.api, top.nope, '', npm:, 'a b'] }
`),
      [
        'root.main.dependencies: expected names, such as [domain, ports.projectStore, npm:x]',
        "root.main.dependencies: 'domian': no module or input called domian here; in scope: domain",
        "root.main.dependencies: 'top.nope': no module or input called nope here; in scope: domain",
        "root.main.dependencies: 'a b': no module or input called a b here; in scope: domain",
      ],
    );
  });

  it('refuses a requirement nothing uses, and a call site that leaves one unbound', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    ui: { dir: src/ui, archetype: ui, dependencies: [domain, npm:react] }
    other: { dir: src/other, archetype: ui }
archetypes:
  ui:
    requires: [domain, react, icons]
    modules:
      render: { files: '*.tsx', dependencies: [domain, react] }
`),
      [
        'ui requires icons, which none of its modules names in dependencies',
        'root.ui uses ui, which requires react; bind the package by name in root.ui.dependencies, { react: npm:react }',
        'root.ui uses ui, which requires icons; name it in root.ui.dependencies',
        'root.other uses ui, which requires domain; name it in root.other.dependencies',
        'root.other uses ui, which requires react; name it in root.other.dependencies',
        'root.other uses ui, which requires icons; name it in root.other.dependencies',
      ],
    );
  });

  it('refuses unknown keys and values of the wrong shape, at every level', () => {
    assert.deepEqual(
      failures(`
layers: {}
root:
  description: 3
  modules:
    both: { dir: a, files: a.ts }
    none: { exposes: all }
    flat: { files: f.ts, modules: { x: { files: x.ts } } }
    typo: { files: t.ts, dependecies: [x] }
    open: { files: o.ts, exposes: some }
    named: { files: n.ts, archetype: card }
    a.b: { files: ab.ts }
  test:
    exposes: [x]
    kit: []
archetypes:
  root: {}
  card:
    marker: 3
    requires: x
    exposes: { render: [x] }
    usings: []
    test: { requires: 3, modules: { t: { files: '*.test.ts' } } }
`),
      [
        'warp.yaml: unknown key layers; a config takes root, archetypes, rulesets, plugins, tsconfig',
        'archetypes.root: root is the repository; name the archetype otherwise',
        'card: unknown key usings; an archetype takes description, marker, requires, entry, exposes, modules, test',
        'card.test.requires: expected a name or a list of names',
        "card.marker: expected a file pattern, such as '{name}.dom.ts'",
        'card.exposes: expected all, a list of its modules, or { files: [...] }',
        'root.test: unknown key kit; a test block takes requires, dependencies, provides, exposes, modules',
        'root.description: expected a string',
        'root.both: a module has dir or files, not both',
        'root.none: expected dir, files or an archetype',
        'root.flat.modules: a files module has no modules; use dir for a folder of them',
        'root.typo: unknown key dependecies; a module takes description, dir, files, entry, archetype, dependencies, exposes, modules, test',
        'root.open.exposes: expected all, or { files: [...] }',
        'root.named: an archetype makes a folder module; give it a dir',
        'root.named.files: card defines what is inside; declare files there',
        "root: a module's name has no dots, not 'a.b'",
        "root.test.exposes: 'x': no module or input called x here; in scope: a.b, both, flat, named, none, open, typo",
      ],
    );
  });

  it('refuses a dir that is not folder names and whole-segment stars', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    fine: { dir: [src/ui, 'src/*/x', src/__testHelpers__] }
    two: { dir: '*/*' }
    partial: { dir: 'src/*-x' }
    up: { dir: ../x }
    here: { dir: ./x }
    empty: { dir: src//x }
    deep: { dir: 'src/**' }
`),
      [
        "root.two.dir: one '*' per dir, which names each instance {name}; '*/*' has more",
        "root.up.dir: a dir is folder names or '*', a whole segment each, not '../x'",
        "root.here.dir: a dir is folder names or '*', a whole segment each, not './x'",
        "root.empty.dir: a dir is folder names or '*', a whole segment each, not 'src//x'",
        "root.deep.dir: a dir is folder names or '*', a whole segment each, not 'src/**'",
      ],
    );
  });

  it('refuses an archetype call site that declares what the archetype defines', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    ui: { dir: src/ui, archetype: ui, exposes: all, modules: {}, test: { modules: {} } }
    nowhere: { dir: src/x, archetype: missing }
    loose: { archetype: ui }
archetypes:
  ui: { modules: { render: { files: '*.tsx' } } }
`),
      [
        'root.ui.exposes: ui defines what is inside; declare exposes there',
        'root.ui.modules: ui defines what is inside; declare modules there',
        'root.ui.test.modules: ui defines its test code; declare modules there',
        'root.nowhere.archetype: no archetype called missing',
        'root.loose: an archetype makes a folder module; give it a dir',
      ],
    );
  });

  it('refuses a reference to a module that exposes nothing, or to a surface it does not have', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    domain: { dir: src/domain }
    files: { dir: src/files, exposes: { files: [a.ts] } }
    ui: { dir: src/ui, archetype: ui }
    main: { files: main.ts, dependencies: [domain, files.api, ui.nope] }
archetypes:
  ui:
    exposes: [render]
    modules:
      render: { files: '*.tsx', exposes: all }
`),
      [
        "root.main.dependencies: 'domain': domain exposes nothing: give it exposes, or drop the reference",
        "root.main.dependencies: 'files.api': files exposes { files: [a.ts] }, not named surfaces",
        "root.main.dependencies: 'ui.nope': ui (ui) exposes render",
      ],
    );
    assert.deepEqual(
      failures(`
root: { modules: { ui: { dir: src/ui, archetype: ui } } }
archetypes:
  ui:
    exposes: [render, render]
    entry: index.ts
    modules:
      render: { files: '*.tsx', exposes: all }
`),
      ["ui.exposes: an entry is the module's whole surface; give it entry or exposes"],
    );
  });

  it('defaults tsconfig to tsconfig.json, takes a list, and refuses anything else', () => {
    const root = "root: { modules: { src: { files: '**' } } }\n";
    assert.deepEqual(load(root).config.tsconfig, ['tsconfig.json']);
    assert.deepEqual(load(`${root}tsconfig: [a.json, b.json]\n`).config.tsconfig, ['a.json', 'b.json']);
    assert.deepEqual(failures(`${root}tsconfig: []\n`), ['tsconfig: expected a path or a list of paths']);
    assert.throws(() => load('[root]'), /warp\.yaml: expected a mapping, root: \{ modules: \.\.\. \}/);
  });

  it('checks rule ids against the registered rules and unclassified, and each rule options with its own check', () => {
    const root = "root: { modules: { src: { files: '**' }, test: { files: '*.test.ts' } } }\n";
    const builtins = [...builtinRegistry.values()];
    assert.deepEqual(
      failures(
        `${root}rulesets:
  default:
    extends: [warp:recommended]
    rules: { dependency-direction: { strict: true }, file-cohesion: { maxLines: 0 }, unclassified: off }
    on:
      root: { no-cycle: { types: count, depth: 1, width: 2 }, module-cycle: { types: ignore } }
      root.src: { module-cycle: { types: sometimes } }
      root.test: { '*': off, no-such-rule: off }
`,
        { builtins },
      ),
      [
        'rulesets.default.rules.dependency-direction: unknown key strict',
        'rulesets.default.rules.file-cohesion.maxLines: expected a whole number of at least 1',
        'rulesets.default.on.root.no-cycle: unknown key depth, width',
        "rulesets.default.on.root.src.module-cycle.types: expected 'count' or 'ignore'",
        'rulesets.default.on.root.test: no rule called no-such-rule',
      ],
    );
    const thrower = {
      builtins: [
        {
          id: 'no-cycle',
          parseOptions: () => {
            throw new TypeError('not a config problem');
          },
          check: () => [],
        },
      ],
    };
    assert.throws(
      () => load(`${root}rulesets: { default: { rules: { no-cycle: { types: count } } } }\n`, thrower),
      TypeError,
    );
  });

  it("joins plugins' rules to the built-in ones under their namespace, ids and options checked alike", () => {
    const limit: FileRule<{ max: number }> = {
      id: 'max-imports',
      defaults: { max: 5 },
      parseOptions: wholeNumberOptions({ max: 5 }),
      check: () => [],
    };
    const builtins = [builtinRegistry.get('file-cohesion')!];
    const plugins = { mine: { rules: [limit] } };
    const yaml = `
plugins: { mine: ./rules/mine.ts }
root: { modules: { src: { files: '**' } } }
rulesets:
  default:
    on: { root.src: { mine/max-imports: { max: 0 }, max-imports: off } }
`;
    assert.deepEqual(failures(yaml, { builtins, plugins }), [
      'rulesets.default.on.root.src.mine/max-imports.max: expected a whole number of at least 1',
      'rulesets.default.on.root.src: no rule called max-imports',
    ]);
    assert.deepEqual(
      load("root: { modules: { src: { files: '**' } } }", { builtins, plugins }).rules.map((rule) => rule.id),
      ['file-cohesion', 'mine/max-imports'],
    );
    assert.deepEqual(failures(yaml.replace('mine/max-imports: { max: 0 }, ', ''), { builtins }), [
      'plugins.mine: not loaded; warp loads each plugin from its path before reading the config',
    ]);
    assert.deepEqual(failures('plugins: [./x.ts]\nroot: {}\n'), [
      'plugins: expected plugin paths by namespace, { wt: ./rules/wt.ts }',
    ]);
  });

  it('refuses rule settings of the wrong shape', () => {
    assert.deepEqual(
      failures(`
root: { modules: { src: { files: '**' } } }
rulesets:
  default:
    on:
      root: { '*': {}, file-cohesion: 3, cognitive-complexity: [x] }
      root.src: all
`),
      [
        'rulesets.default.on.root.*: expected on, off',
        'rulesets.default.on.root.file-cohesion: expected on, off or options',
        'rulesets.default.on.root.cognitive-complexity: expected on, off or options',
        'rulesets.default.on.root.src: expected off or rule settings by id',
      ],
    );
  });

  it('reports a repeated mistake once', () => {
    assert.deepEqual(failures("root: { modules: { src: { files: '**', dependencies: [icons, icons] } } }"), [
      "root.src.dependencies: 'icons': no module or input called icons here; in scope: nothing",
    ]);
  });
});
