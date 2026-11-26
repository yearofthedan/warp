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
      { kind: 'module', module: 'core', up: 1, top: true },
    ]);
  });

  it('refuses top. naming the module it is written in', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    main: { files: src/main.ts, dependencies: [top.main], exposes: all }
`),
      ["root.main.dependencies: 'top.main': a module reaches its own files already"],
    );
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

  it("refuses a surface of an input that the input's binding does not have", () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    lib: { dir: src/lib, archetype: lib }
    flat: { files: 'src/*.ts', exposes: all }
    a: { dir: src/a, archetype: card, dependencies: { log: lib }, test: { dependencies: { kit: npm:vitest } } }
    b: { dir: src/b, archetype: card, dependencies: { log: npm:log } }
    c: { dir: src/c, archetype: card, dependencies: { log: lib.api }, test: { dependencies: { kit: npm:vitest } } }
    d: { dir: src/d, archetype: card, dependencies: { log: flat }, test: { dependencies: { kit: npm:vitest } } }
    nest:
      dir: src/nest
      modules:
        inner: { dir: inner, archetype: card, dependencies: { log: lib }, test: { dependencies: { kit: npm:vitest } } }
archetypes:
  card:
    requires: [log]
    modules:
      view: { files: '*.ts', dependencies: [log.render] }
    test:
      requires: [kit]
      modules:
        tests: { files: '*.test.ts', dependencies: [kit] }
  lib:
    exposes: [api]
    modules:
      api: { files: '*.ts', exposes: all }
`),
      [
        "card.view.dependencies: 'log.render': root.a binds log to lib; lib exposes api",
        'root.b uses card, whose tests require kit; name it in root.b.test.dependencies',
        "card.view.dependencies: 'log.render': root.b binds log to npm:log; a package has no surfaces",
        "card.view.dependencies: 'log.render': root.c binds log to lib.api; lib.api is a surface already",
        "card.view.dependencies: 'log.render': root.d binds log to flat; flat has no named surfaces",
        "card.view.dependencies: 'log.render': root.nest.inner binds log to lib; lib exposes api",
      ],
    );
  });

  it('makes an archetype that only test modules use test code, with the modules written inside it', () => {
    const fixtures = `
root:
  modules:
    src: { dir: src, exposes: all }
  test:
    modules:
      fixtures: { dir: fixtures, archetype: fixture }
archetypes:
  fixture:
    modules:
      helpers: { dir: helpers, modules: { seeds: { files: '*.seed.ts' } } }
`;
    const { archetypes } = load(fixtures).config;
    assert.equal(archetypes.fixture!.test, true);
    assert.equal(archetypes['fixture.helpers']!.test, true);
    assert.equal(archetypes['root.src']!.test, undefined);
    assert.deepEqual(
      failures(fixtures.replace('exposes: all }', 'exposes: all }\n    more: { dir: more, archetype: fixture }')),
      ['fixture is used by production and test modules; an archetype holds one or the other'],
    );
  });

  it('refuses archetype names and roots of the wrong shape', () => {
    const one = '\nroot: { modules: { x: { dir: x } } }\n';
    assert.deepEqual(failures(`${one}archetypes: [x]`), ['archetypes: expected archetypes by name']);
    assert.deepEqual(failures(`${one}archetypes: { a.b: { modules: {} } }`), [
      "archetypes: a name has no dots, not 'a.b'",
    ]);
  });

  it('refuses modules, names and test blocks of the wrong shape', () => {
    assert.deepEqual(
      failures(`
root:
  bogus: 1
  modules:
    x: 3
    a.b: { dir: ab }
    f: { files: [] }
    i: { dir: i, modules: {}, test: { requires: [y], dependencies: [y] } }
    j: { dir: j, test: 3 }
    k: { dir: k, dependencies: [k, 'npm:', 'virtual:', a.b.c, 'top.', x.y.z] }
    l: { dir: l, dependencies: { a: 3 } }
    m: { dir: m, dependencies: 3 }
`),
      [
        'root: unknown key bogus; the root takes description, modules, test',
        'root.x: expected a mapping',
        'root.x: expected dir, files or an archetype',
        "root: a module's name has no dots, not 'a.b'",
        'root.f.files: expected a file pattern or a list of them',
        "root.i.test.dependencies: fills an archetype's test.requires; i has no archetype",
        "root.i.test.dependencies: fills an archetype's test.requires, where a module uses one",
        'root.i.test.requires: only an archetype requires; its modules see what it requires',
        'root.j.test: expected a test block',
        "root.k.dependencies: 'k': a module reaches its own files already",
        "root.k.dependencies: 'npm:': a package has a name",
        "root.k.dependencies: 'virtual:': a package has a name",
        "root.k.dependencies: 'a.b.c': a name is a module, a module and one of its surfaces, or an input",
        "root.k.dependencies: 'top.': a name is a module, a module and one of its surfaces, or an input",
        "root.k.dependencies: 'x.y.z': a name is a module, a module and one of its surfaces, or an input",
        'root.l.dependencies: expected a name for each key',
        'root.m.dependencies: expected a list of names, or a map from name to name',
      ],
    );
  });

  it('refuses a call site that binds one name twice, and test code that offers or provides', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    a: { dir: a, exposes: all }
    b: { dir: b, exposes: all, modules: { log: { files: log.ts, exposes: all } } }
    c: { dir: c, archetype: card, dependencies: [a, b.log, a] }
  test:
    modules:
      fx: { dir: fx, modules: { inner: { dir: i } }, test: { exposes: [inner], provides: [inner] } }
archetypes:
  card:
    requires: [log, a]
    modules:
      view: { files: '*.ts', dependencies: [log, a] }
`),
      [
        'root.c.dependencies: two entries are named a; rename one with a map',
        'root.fx: unknown key test; a module takes description, dir, files, archetype, dependencies, exposes, modules',
        'root.fx.test.exposes: root.fx is test code; what it exposes is for tests already',
        'root.fx.test.provides: root.fx is test code; give its modules dependencies',
      ],
    );
  });

  it("refuses an archetype's surfaces of the wrong shape, and a test input in production code", () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    c: { dir: c, archetype: card, dependencies: [g], test: { dependencies: [g] } }
    g: { dir: g, exposes: all }
  test:
    modules:
      fx: { dir: fx, archetype: fixture }
archetypes:
  card:
    requires: [log]
    test: { requires: [kit] }
    exposes: 3
    modules:
      view: { files: '*.ts', dependencies: [log, kit], exposes: all }
  fixture:
    exposes: [a, a, npm:x]
    modules:
      a: { files: '*.ts', exposes: { files: x.ts, other: 1 } }
`),
      [
        "card.view.dependencies: 'kit': no module or input called kit here; kit is a test input, which only test code may name; in scope: log",
        'card.exposes: expected all, a list of its modules, or { files: [...] }',
        'fixture.a.exposes: expected all, or { files: [...] }',
        "fixture.exposes: offers 'a' twice; rename the module at its source",
        "fixture.exposes: 'npm:x': exposes names the module's own modules",
      ],
    );
  });

  it("gives a files module test modules of its own, which name the files module's siblings", () => {
    const tests = `
root:
  modules:
    g: { files: b.ts, exposes: all }
    f:
      files: a.ts
      test: { modules: { u: { files: '*.test.ts', dependencies: [g] } } }
`;
    assert.deepEqual(load(tests).config.archetypes.root!.modules.at(-1), {
      kind: 'test',
      name: 'f.u',
      patterns: ['*.test.ts'],
      of: 'f',
      using: [{ kind: 'module', module: 'g' }],
    });
    assert.deepEqual(
      failures(tests.replace('test: { modules: { u:', 'test: { provides: [g], modules: { t: { dir: d }, u:')),
      [
        "root.f.test.provides: a files module's test block holds its test modules only",
        "root.f.test.modules.t: a files module's tests are files; use files",
        'root.f.t.files: expected a file pattern or a list of them',
      ],
    );
  });

  it("names a files module's test module by its dotted name, from test code only", () => {
    const tests = `
root:
  modules:
    f:
      files: a.ts
      test: { modules: { u: { files: '*.test.ts' } } }
  test:
    modules:
      e2e: { dir: e2e, dependencies: [f.u] }
`;
    const e2e = load(tests).config.archetypes.root!.modules.find((module) => module.name === 'e2e')!;
    assert.deepEqual(e2e.using, [{ kind: 'module', module: 'f.u' }]);
    assert.deepEqual(failures(tests.replace('files: a.ts', 'files: a.ts\n      dependencies: [f.u]')), [
      "root.f.dependencies: 'f.u': f.u is a test module, which only test code may name",
    ]);
  });

  it('says what a referenced module exposes when a surface is missing, and keeps test surfaces for test code', () => {
    assert.deepEqual(
      failures(`
root:
  modules:
    flat: { files: 'a/*.ts', exposes: all }
    ui: { dir: src/ui, archetype: ui }
    quiet: { dir: src/quiet, archetype: quiet }
    main: { files: main.ts, dependencies: [flat.x, ui.driver, quiet] }
  test:
    modules:
      helpers: { dir: helpers }
      kit: { dir: kit, archetype: kit }
      e2e: { dir: e2e, dependencies: [helpers.x, ui.nope, quiet.nope, kit.x, quiet.driver, ui.driver] }
archetypes:
  ui:
    exposes: [render]
    modules:
      render: { files: '*.tsx', exposes: all }
    test:
      exposes: [driver]
      modules:
        driver: { files: '*.driver.ts' }
  quiet:
    test:
      exposes: [driver]
      modules:
        driver: { files: '*.driver.ts' }
  kit:
    modules:
      a: { files: '*.ts' }
`),
      [
        "root.main.dependencies: 'flat.x': flat exposes all its files, not named surfaces",
        "root.main.dependencies: 'ui.driver': driver is a test surface of ui (ui), which only test code may name",
        "root.main.dependencies: 'quiet': quiet (quiet) exposes nothing: give it exposes, or drop the reference",
        "root.e2e.dependencies: 'helpers.x': helpers exposes all its files, not named surfaces",
        "root.e2e.dependencies: 'ui.nope': ui (ui) exposes render, driver",
        "root.e2e.dependencies: 'quiet.nope': quiet (quiet) exposes driver",
        "root.e2e.dependencies: 'kit.x': kit (kit) exposes all its files, not named surfaces",
      ],
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
