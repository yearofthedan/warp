import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { defineConfig } from '../config.ts';
import { archetype, dir, files, mustImport, pkg, requiredRefs } from './builder.ts';
import { ConfigError } from '../rule.ts';
import { loadConfigData } from './load.ts';

/** Working title's config from docs/design/archetypes.md, as the spike ran it. */
const workingTitleConfig = () => {
  const testRunner = archetype('test-runner')
    .contains((p) =>
      p
        .files('contract', ['driver.ts', 'steps.ts', 'seed.ts', 'narrowing.ts', 'scenario-file.ts', 'ids.ts'])
        .files('runner', '**', { using: (s) => [s.contract] }),
    )
    .exposes((s) => ({ contract: s.contract, runner: s.runner }));

  // a folder of code whose tests need the runner: domain, application, adapters, lint
  const layer = archetype('layer')
    .requires({ testRunner, methods: dir() })
    .contains((p, { required }) =>
      p.files('src', '**').files('test', '**/*.test.ts', {
        using: (s) => [
          s.src,
          required.testRunner.runner,
          required.testRunner.contract,
          required.methods,
          pkg('vite-plus/*'),
        ],
      }),
    )
    .exposes((s) => ({ code: s.src }));

  const component = archetype('component')
    .identify({ marker: '{name}.dom.ts' })
    .requires({ testRunner, application: layer, ports: dir(), strings: dir(), icons: dir(), transition: files() })
    .contains((p, { required, self }) =>
      p
        .dir('subcomponent', '{name}', self)
        .files('logic', '*.ts', { using: [required.strings, required.application] })
        .files('dom', '{name}.dom.ts', {
          using: (s) => [
            s.logic,
            s.subcomponent.render,
            required.icons,
            required.strings,
            required.transition,
            required.application,
            required.ports,
          ],
        })
        .files('dsl', '*.dsl.ts', { using: (s) => [s.subcomponent.dsl, required.testRunner.contract] })
        .files('testPage', '*.test-page.ts', { using: (s) => [s.subcomponent.testPage, pkg('vite-plus/*')] })
        .files('harness', '*.harness.ts', {
          using: (s) => [
            s.dom,
            s.logic,
            s.dsl,
            s.testPage,
            required.testRunner.runner,
            required.testRunner.contract,
            required.application,
            required.ports,
            pkg('vite-plus/*'),
          ],
        })
        .files('test', '*.test.ts', {
          using: (s) => [
            s.logic,
            s.dom,
            s.harness,
            s.testPage,
            s.dsl,
            s.subcomponent.testPage,
            required.testRunner.runner,
            required.testRunner.contract,
            required.application,
            pkg('vite-plus/*'),
            pkg('@playwright/*'),
          ],
        }),
    )
    .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }))
    .rules((s, { required }) => ({
      'dsl-on-the-driver-contract': mustImport({ from: s.dsl, to: required.testRunner.contract }),
    }));

  const ui = archetype('ui')
    .contains((p) =>
      p
        .dir('components', '{name}', component)
        .dir('strings', 'strings', { description: "The app's words" })
        .dir('icons', 'icons')
        .files('transition', 'transition.ts')
        .files('test', '*.test.ts', { using: (s) => [s.transition, pkg('vite-plus/*')] }),
    )
    .provides((s) => ({ strings: s.strings, icons: s.icons, transition: s.transition }))
    .exposes((s) => ({
      render: s.components.render,
      testPage: s.components.testPage,
      dsl: s.components.dsl,
      strings: s.strings,
    }));

  const journeys = archetype('journeys')
    .requires({ testRunner, ui })
    .contains((p, { required }) =>
      p.files('dsl', '*.dsl.ts', { using: [required.testRunner.contract, required.ui.dsl] }).files('rest', '**', {
        using: (s) => [s.dsl, required.testRunner.runner, required.testRunner.contract, required.ui.dsl],
      }),
    )
    .rules((s, { required }) => ({
      'dsl-on-the-driver-contract': mustImport({ from: s.dsl, to: required.testRunner.contract }),
    }));

  const workingTitle = archetype('working-title')
    .loose('deny')
    .contains((p) =>
      p
        .dir('domain', 'src/domain', layer)
        .dir('ports', 'src/ports', { using: (s) => [s.domain] })
        .dir('methods', 'src/methods', { using: (s) => [s.domain] })
        .dir('application', 'src/application', layer, { using: (s) => [s.domain, s.ports] })
        .dir('adapters', 'src/adapters', layer, { using: (s) => [s.domain, s.ports, pkg('*')] })
        .dir('ui', 'src/ui', ui, { using: (s) => [s.application] })
        .files('styles', 'src/*.css')
        .files('shell', 'src/shell.ts', { using: (s) => [s.application, s.ui.strings] })
        .files('app', ['src/main.ts', 'src/app.ts'], {
          using: (s) => [
            s.application,
            s.adapters,
            s.ports,
            s.methods,
            s.ui.render,
            s.ui.strings,
            s.shell,
            s.styles,
            pkg('virtual:*'),
          ],
        })
        .dir('testRunner', 'src/test-helpers', testRunner, {
          using: (s) => [
            s.domain,
            s.application,
            s.adapters,
            s.methods,
            s.app,
            s.shell,
            s.ui.render,
            s.ui.testPage,
            s.ports,
            pkg('*'),
          ],
        })
        .dir('e2e', 'e2e', journeys, { using: (s) => [s.adapters, s.ui.testPage, pkg('*')] })
        .dir('lint', 'lint', layer, { using: [pkg('*')] })
        .files('tooling', ['*.ts', 'scripts/**/*.ts'], { using: (s) => [s.lint, pkg('*')] }),
    )
    .provides((s) => ({
      testRunner: s.testRunner,
      application: s.application,
      ports: s.ports,
      methods: s.methods,
      ui: s.ui,
    }));

  return defineConfig({ root: workingTitle });
};

/** `required` from outside any archetype, for configs written without the types. */
const requiredOf = () => requiredRefs() as Record<string, never>;

const failures = (config: unknown, options?: Parameters<typeof loadConfigData>[1]): string[] => {
  try {
    loadConfigData(config, options);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  assert.fail('expected a ConfigError');
};

const kid = archetype('kid')
  .contains((p) => p.files('dom', '*.dom.ts').files('page', '*.page.ts'))
  .exposes((s) => ({ render: s.dom, pages: [s.page, s.dom] }));

describe('loadConfigData', () => {
  it("loads working title's config from the design doc", () => {
    const { config, warnings } = loadConfigData(workingTitleConfig());
    assert.deepEqual(warnings, []);
    assert.equal(config.root, 'working-title');
    assert.deepEqual(Object.keys(config.archetypes), [
      'working-title',
      'layer',
      'ui',
      'test-runner',
      'journeys',
      'component',
    ]);
  });

  it('turns every step of the chain into plain data', () => {
    const match = () => false as const;
    const root = archetype('root')
      .description('the project')
      .loose('warn')
      .contains((p) =>
        p
          .dir('strings', 'strings', { description: 'words' })
          .dir('kids', ['kids/{name}', 'more/{name}'], kid, { using: (s) => [s.strings, pkg('lit')] })
          .files('main', 'main.ts', { using: (s) => [s.kids.render, s.kids], rules: { 'module-cohesion': false } }),
      )
      .exposes((s) => ({ main: s.main }))
      .provides((s) => ({ strings: s.strings }))
      .rules({ '*': false, 'cognitive-complexity': { max: 10 } });
    const node = archetype('node')
      .identify({ match })
      .requires({ strings: dir() })
      .contains((p, { required, self }) =>
        p.dir('child', '{name}', self).files('src', '**', { using: [required.strings] }),
      )
      .rules((s, { required }) => ({ 'src-on-strings': mustImport({ from: s.src, to: required.strings }) }));
    const config = defineConfig({
      root: archetype('top')
        .contains((p) => p.dir('words', 'words').dir('root', 'root', root).dir('nodes', 'nodes', node))
        .provides((s) => ({ strings: s.words })),
      tsconfig: ['tsconfig.json', 'tsconfig.test.json'],
      rules: 'off',
    });
    const { config: data, warnings } = loadConfigData(config);
    assert.deepEqual(warnings, ['root provides strings, which nothing below requires']);
    assert.deepEqual(data, {
      root: 'top',
      tsconfig: ['tsconfig.json', 'tsconfig.test.json'],
      plugins: {},
      rules: 'off',
      archetypes: {
        top: {
          name: 'top',
          requires: {},
          parts: [
            { kind: 'dir', name: 'words', paths: ['words'], using: [] },
            { kind: 'dir', name: 'root', paths: ['root'], archetype: 'root', using: [] },
            { kind: 'dir', name: 'nodes', paths: ['nodes'], archetype: 'node', using: [] },
          ],
          provides: { strings: { kind: 'part', part: 'words' } },
        },
        root: {
          name: 'root',
          description: 'the project',
          requires: {},
          parts: [
            { kind: 'dir', name: 'strings', paths: ['strings'], using: [], description: 'words' },
            {
              kind: 'dir',
              name: 'kids',
              paths: ['kids/{name}', 'more/{name}'],
              archetype: 'kid',
              using: [
                { kind: 'part', part: 'strings' },
                { kind: 'package', pattern: 'lit' },
              ],
            },
            {
              kind: 'files',
              name: 'main',
              patterns: ['main.ts'],
              using: [
                { kind: 'part', part: 'kids', surface: 'render' },
                { kind: 'part', part: 'kids' },
              ],
              rules: { 'module-cohesion': false },
            },
          ],
          exposes: { main: [{ kind: 'part', part: 'main' }] },
          provides: { strings: { kind: 'part', part: 'strings' } },
          loose: 'warn',
          rules: { '*': false, 'cognitive-complexity': { max: 10 } },
        },
        node: {
          name: 'node',
          identify: { match },
          requires: { strings: { kind: 'dir' } },
          parts: [
            { kind: 'dir', name: 'child', paths: ['{name}'], archetype: 'node', using: [] },
            { kind: 'files', name: 'src', patterns: ['**'], using: [{ kind: 'required', name: 'strings' }] },
          ],
          provides: {},
          rules: {
            'src-on-strings': {
              inline: 'mustImport',
              from: { kind: 'part', part: 'src' },
              to: { kind: 'required', name: 'strings' },
            },
          },
        },
        kid: {
          name: 'kid',
          requires: {},
          parts: [
            { kind: 'files', name: 'dom', patterns: ['*.dom.ts'], using: [] },
            { kind: 'files', name: 'page', patterns: ['*.page.ts'], using: [] },
          ],
          exposes: {
            render: [{ kind: 'part', part: 'dom' }],
            pages: [
              { kind: 'part', part: 'page' },
              { kind: 'part', part: 'dom' },
            ],
          },
          provides: {},
        },
      },
    });
  });

  it('defaults tsconfig to tsconfig.json and keeps plugins as given', () => {
    const plugins = { mine: { rules: [] } };
    const { config } = loadConfigData({ root: archetype('a').contains((p) => p.files('src', '**')), plugins });
    assert.deepEqual(config.tsconfig, ['tsconfig.json']);
    assert.equal(config.plugins, plugins);
    assert.equal(
      loadConfigData({ root: archetype('a'), tsconfig: 'tsconfig.app.json' }).config.tsconfig[0],
      'tsconfig.app.json',
    );
  });

  it('answers a requirement with the nearest provider above, down a recursive archetype', () => {
    const leaf = archetype('leaf')
      .requires({ icons: dir() })
      .contains((p, { required, self }) =>
        p.dir('sub', '{name}', self).files('src', '**', { using: [required.icons] }),
      );
    const middle = archetype('middle')
      .contains((p) => p.dir('icons', 'icons').dir('leaves', '{name}', leaf))
      .provides((s) => ({ icons: s.icons }));
    const top = archetype('top')
      .contains((p) => p.dir('icons', 'icons').dir('middle', 'middle', middle))
      .provides((s) => ({ icons: s.icons }));
    assert.deepEqual(loadConfigData({ root: top }).warnings, ['top provides icons, which nothing below requires']);
  });

  it('warns about a provision that nothing below requires', () => {
    const root = archetype('root')
      .contains((p) => p.dir('strings', 'strings').files('transition', 'transition.ts'))
      .provides((s) => ({ strings: s.strings, transition: s.transition }));
    assert.deepEqual(loadConfigData({ root }).warnings, [
      'root provides strings, which nothing below requires',
      'root provides transition, which nothing below requires',
    ]);
  });

  it('refuses a requirement that nothing above provides, once per archetype', () => {
    const component = archetype('component')
      .requires({ icons: dir() })
      .contains((p, { required, self }) =>
        p.dir('sub', '{name}', self).files('dom', '*.dom.ts', { using: [required.icons] }),
      );
    const ui = archetype('ui').contains((p) => p.dir('components', '{name}', component));
    const root = archetype('app').contains((p) => p.dir('ui', 'src/ui', ui));
    assert.deepEqual(failures({ root }), ['ui.components (component) requires icons, which nothing above it provides']);
  });

  it('refuses a requirement on the root, which has nothing above it', () => {
    const root = archetype('app')
      .requires({ icons: dir() })
      .contains((p, { required }) => p.files('src', '**', { using: [required.icons] }));
    assert.deepEqual(failures({ root }), ['app requires icons, which nothing above it provides']);
  });

  it('refuses a provider whose part does not fit the requirement', () => {
    const layer = archetype('layer').contains((p) => p.files('src', '**'));
    const other = archetype('other').contains((p) => p.files('src', '**'));
    const child = archetype('child')
      .requires({ application: layer, strings: dir(), transition: files() })
      .contains((p, { required }) =>
        p.files('src', '**', { using: [required.application, required.strings, required.transition] }),
      );
    const root = archetype('root')
      .contains((p) =>
        p
          .dir('application', 'src/application', other)
          .files('strings', 'strings.ts')
          .dir('transition', 'transition')
          .dir('child', 'child', child),
      )
      .provides((s) => ({ application: s.application, strings: s.strings, transition: s.transition }));
    assert.deepEqual(failures({ root }), [
      'child (child) requires application as units of layer; root provides application from application, units of other',
      'child (child) requires strings as a plain folder (dir()); root provides strings from strings, a files part',
      'child (child) requires transition as a files part (files()); root provides transition from transition, a plain folder',
    ]);
  });

  it('accepts each kind of provider for the requirement it fits', () => {
    const layer = archetype('layer').contains((p) => p.files('src', '**'));
    const child = archetype('child')
      .requires({ application: layer, strings: dir(), transition: files() })
      .contains((p, { required }) =>
        p.files('src', '**', { using: [required.application, required.strings, required.transition] }),
      );
    const root = archetype('root')
      .contains((p) =>
        p
          .dir('application', 'src/application', layer)
          .dir('strings', 'strings')
          .files('transition', 'transition.ts')
          .dir('child', 'child', child),
      )
      .provides((s) => ({ application: s.application, strings: s.strings, transition: s.transition }));
    assert.deepEqual(loadConfigData({ root }).warnings, []);
  });

  it('refuses a requirement that no part lists in using', () => {
    const child = archetype('child')
      .requires({ icons: dir(), strings: dir() })
      .contains((p, { required }) => p.files('src', '**', { using: [required.icons] }));
    const root = archetype('root')
      .contains((p) => p.dir('icons', 'icons').dir('strings', 'strings').dir('child', 'child', child))
      .provides((s) => ({ icons: s.icons, strings: s.strings }));
    assert.deepEqual(failures({ root }), ['child requires strings, which no part lists in using']);
  });

  it('refuses two archetypes with one name', () => {
    const a = archetype('same').contains((p) => p.files('a', 'a.ts'));
    const b = archetype('same').contains((p) => p.files('b', 'b.ts'));
    const root = archetype('root').contains((p) => p.dir('a', 'a', a).dir('b', 'b', b));
    assert.deepEqual(failures({ root }), ['two archetypes are named same: give each its own name']);
  });

  it('checks rule ids against the ones it is given', () => {
    const root = archetype('root')
      .contains((p) =>
        p.files('src', '**').files('test', '*.test.ts', { rules: { '*': false, 'no-such-rule': false } }),
      )
      .rules((s) => ({
        'module-cohesion': mustImport({ from: s.test, to: s.src }),
        'my-rule': mustImport({ from: s.test, to: s.src }),
      }));
    assert.deepEqual(
      failures(
        { root, rules: { 'cognitive-complexity': { max: 3 } } },
        { ruleIds: ['module-cohesion', 'cognitive-complexity'] },
      ),
      [
        'root.test.rules: no rule called no-such-rule',
        'root.rules.module-cohesion: module-cohesion is a built-in rule; give the inline rule its own name',
      ],
    );
  });

  it('refuses rule settings of the wrong shape', () => {
    const root = archetype('root')
      .contains((p) => p.files('src', '**', { rules: 'all' as never }))
      .rules({ '*': {}, 'module-cohesion': 3 as never, 'cognitive-complexity': pkg('x') as never });
    assert.deepEqual(
      failures({ root, rules: { mine: mustImport({ from: pkg('a') as never, to: pkg('b') as never }) } }),
      [
        "root.src.rules: expected 'off' or rule settings by id",
        'root.rules.*: expected true, false',
        'root.rules.module-cohesion: expected true, false, options or an inline rule',
        'root.rules.cognitive-complexity: expected true, false, options or an inline rule',
        'config.rules.mine: an inline rule belongs to an archetype or a part',
      ],
    );
  });

  it("checks an inline rule's references", () => {
    const root = archetype('root')
      .contains((p) => p.files('src', '**').files('test', '*.test.ts'))
      // @ts-expect-error a files part has no surfaces
      .rules((s) => ({ 'tests-on-src': mustImport({ from: pkg('vitest') as never, to: s.src.api }) }));
    assert.deepEqual(failures({ root }), [
      "root.rules.tests-on-src takes from pkg('vitest'); pkg() belongs in using",
      'root.rules.tests-on-src takes to src.api; src is a files part, which has no surfaces',
    ]);
  });

  it('refuses a malformed config, root and requirements', () => {
    assert.throws(() => loadConfigData(undefined), /config: expected an object, defineConfig\(\{ root \}\)/);
    assert.throws(() => loadConfigData({ root: {} }), /config\.root: expected an archetype/);
    const root = archetype('root')
      .requires({ x: 'nope' as never })
      .contains((p) => p.files('src', '**'));
    assert.deepEqual(failures({ root, kinds: {}, exclude: [], tsconfig: [], plugins: [] }), [
      'config: unknown key kinds, exclude',
      'root.requires.x: expected an archetype, dir() or files()',
      'config.tsconfig: expected a path or a list of paths',
      'config.plugins: expected plugins by namespace',
    ]);
    assert.deepEqual(failures({ root: archetype('r').requires(3 as never) }), [
      'r.requires: expected requirements by name, { testRunner, strings: dir() }',
    ]);
  });

  it('refuses malformed steps of the chain', () => {
    const root = archetype('root')
      .identify({ marker: '' })
      .loose('sometimes' as never)
      .description(3 as never)
      .contains((p) =>
        p
          .files('', '*.ts')
          .files('a.b', '*.ts')
          .files(3 as never, '*.ts')
          .files('empty', [])
          .files('blank', ['src/*.ts', ''])
          .files('number', [3] as never)
          .dir('nowhere', '')
          .dir('bad', 'x', 'options' as never)
          .files('odd', 'odd.ts', { usin: [], uses: [] } as never)
          .files('flat', 'flat.ts', { using: pkg('x') as never, description: 1 as never })
          .files('notRef', 'n.ts', { using: ['src'] as never }),
      )
      .exposes('all' as never)
      .provides(3 as never);
    assert.deepEqual(failures({ root }), [
      'root.description: expected a string',
      "root.loose: expected 'allow', 'warn' or 'deny'",
      "root.identify: expected { marker: '{name}.dom.ts' } or { match: (dir, chain) => ... }",
      'root: a part\'s name is a non-empty string without dots, not ""',
      'root: a part\'s name is a non-empty string without dots, not "a.b"',
      "root: a part's name is a non-empty string without dots, not 3",
      'root.empty: expected a pattern or a list of them',
      'root.blank: expected a pattern or a list of them',
      'root.number: expected a pattern or a list of them',
      'root.nowhere: expected a path or a list of them',
      'root.bad: expected options, { using, rules }',
      'root.odd: unknown option usin, uses',
      'root.flat.description: expected a string',
      'root.flat.using: expected a list of references, or a callback returning one',
      'root.exposes: expected a callback returning surfaces, (s) => ({ render: s.dom })',
      'root.provides: expected a callback returning parts by name, (s) => ({ strings: s.strings })',
      "root.notRef uses something other than a reference: use s.part, required.name or pkg('name')",
    ]);
  });

  it('refuses callbacks that return the wrong thing', () => {
    const root = archetype('root')
      .contains(() => undefined as never)
      .exposes(() => 'all' as never)
      .provides(() => null as never);
    assert.deepEqual(failures({ root }), [
      'root.contains: expected the parts chain, (p) => p.files(...)',
      'root.exposes: expected a callback returning surfaces, (s) => ({ render: s.dom })',
      'root.provides: expected a callback returning parts by name, (s) => ({ strings: s.strings })',
    ]);
    assert.deepEqual(
      failures({
        root: archetype('r')
          .identify(null as never)
          .requires(null as never),
      }),
      [
        "r.identify: expected { marker: '{name}.dom.ts' } or { match: (dir, chain) => ... }",
        'r.requires: expected requirements by name, { testRunner, strings: dir() }',
      ],
    );
  });

  it('refuses an empty package pattern, and names every requirement and surface it knows', () => {
    const both = archetype('both')
      .contains((p) => p.files('src', '**'))
      .exposes(() => ({}));
    const root = archetype('root')
      .requires({ icons: dir(), strings: dir(), both })
      .contains((p, { required }) =>
        p.files('src', '**', {
          // @ts-expect-error both exposes nothing
          using: [pkg(''), required.icons, required.strings, required.both.api, required.nope as never],
        }),
      );
    assert.deepEqual(failures({ root }), [
      "root.src uses pkg(''); a package pattern is a non-empty string",
      'root.src uses required.both.api; both exposes nothing',
      'root.src uses required.nope; root requires icons, strings, both',
    ]);
  });

  it('reports a repeated mistake once', () => {
    const root = archetype('root').contains((p) =>
      p.files('src', '**', { using: [requiredOf().icons, requiredOf().icons] }),
    );
    assert.deepEqual(failures({ root }), ['root.src uses required.icons; root requires nothing']);
  });

  it('refuses a malformed tsconfig', () => {
    for (const tsconfig of ['', 3, [], [''], ['tsconfig.json', 3]]) {
      assert.deepEqual(failures({ root: archetype('r'), tsconfig }), [
        'config.tsconfig: expected a path or a list of paths',
      ]);
    }
  });

  it('leaves out of the data what the config leaves out', () => {
    assert.deepEqual(loadConfigData({ root: archetype('r').contains((p) => p.files('src', '**')) }).config, {
      root: 'r',
      archetypes: {
        r: {
          name: 'r',
          requires: {},
          parts: [{ kind: 'files', name: 'src', patterns: ['**'], using: [] }],
          provides: {},
        },
      },
      tsconfig: ['tsconfig.json'],
      plugins: {},
    });
  });

  it('reports a misfit once per message, and a missing requirement once per archetype', () => {
    const child = archetype('child')
      .requires({ strings: dir(), icons: dir() })
      .contains((p, { required }) => p.files('src', '**', { using: [required.strings, required.icons] }));
    const middle = archetype('middle')
      .contains((p) => p.dir('other', 'other').dir('child', 'child', child))
      .provides((s) => ({ other: s.other }));
    const root = archetype('root')
      .contains((p) => p.files('strings', 'strings.ts').dir('middle', 'middle', middle).dir('child', 'child', child))
      .provides((s) => ({ strings: s.strings }));
    assert.deepEqual(failures({ root }), [
      'middle.child (child) requires strings as a plain folder (dir()); root provides strings from strings, a files part',
      'middle.child (child) requires icons, which nothing above it provides',
      'child (child) requires strings as a plain folder (dir()); root provides strings from strings, a files part',
    ]);
  });

  it('checks an archetype again under a different provider', () => {
    const layer = archetype('layer').contains((p) => p.files('src', '**'));
    const child = archetype('child')
      .requires({ strings: dir() })
      .contains((p, { required }) => p.files('src', '**', { using: [required.strings] }));
    const middle = archetype('middle')
      .contains((p) => p.dir('strings', 'strings').dir('child', 'child', child))
      .provides((s) => ({ strings: s.strings }));
    const root = archetype('root')
      .contains((p) => p.dir('strings', 'strings', layer).dir('middle', 'middle', middle).dir('child', 'child', child))
      .provides((s) => ({ strings: s.strings }));
    assert.deepEqual(failures({ root }), [
      'child (child) requires strings as a plain folder (dir()); root provides strings from strings, units of layer',
    ]);
  });

  it('refuses a duplicate part and an archetype without a name', () => {
    const nameless = archetype('' as string).contains((p) => p.files('a', 'a.ts'));
    const numbered = archetype(3 as never);
    const root = archetype('root').contains((p) =>
      p
        .files('src', '**')
        .files('src' as never, 'x.ts')
        .dir('n', 'n', nameless)
        .dir('m', 'm', numbered)
        // @ts-expect-error nameless has no .exposes()
        .files('x', 'x.ts', { using: (s) => [s.n.render] }),
    );
    assert.deepEqual(failures({ root }), [
      'archetype(""): a name is a non-empty string',
      'archetype(3): a name is a non-empty string',
      "root: part 'src' is already declared",
      'root.x uses n.render;  has no .exposes(), so it names no surfaces',
    ]);
  });

  it('accepts identify by marker or match, and every loose setting', () => {
    for (const loose of ['allow', 'warn', 'deny'] as const) {
      const { config } = loadConfigData({ root: archetype('r').identify({ marker: '{name}.ts' }).loose(loose) });
      assert.deepEqual(config.archetypes.r, {
        name: 'r',
        identify: { marker: '{name}.ts' },
        requires: {},
        parts: [],
        provides: {},
        loose,
      });
    }
    assert.match(
      failures({ root: archetype('r').identify({ marker: 'a', match: () => false } as never) })[0]!,
      /identify/,
    );
  });
});
