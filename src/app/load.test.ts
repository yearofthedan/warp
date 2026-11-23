import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import {
  all,
  archetype,
  defineConfig,
  dir,
  exposes,
  files,
  pkg,
  requiredRefs,
  ruleset,
  self,
  using,
} from '../model/archetype/builder.ts';
import { ConfigError } from '../model/configError.ts';
import { wholeNumberOptions } from '../rules/rule.ts';
import { loadConfigData } from './load.ts';
import { builtinRegistry } from '../builtins/index.ts';
import type { FileRule } from '../rules/rule.ts';

const workingTitleConfig = () => {
  const testRunner = archetype('test-runner')
    .contains((m) =>
      m
        .module(
          'contract',
          files('driver.ts', 'steps.ts', 'seed.ts', 'narrowing.ts', 'scenario-file.ts', 'ids.ts'),
          exposes(all()),
        )
        .module(
          'runner',
          files('**'),
          exposes(all()).using((m) => [m.contract]),
        ),
    )
    .exposes((m) => ({ contract: m.contract, runner: m.runner }));

  const layer = archetype('layer')
    .requires({ testRunner, methods: dir() })
    .contains((m, { required }) =>
      m.module('src', files('**'), exposes(all())).module(
        'test',
        files('**/*.test.ts'),
        using((m) => [
          m.src,
          required.testRunner.runner,
          required.testRunner.contract,
          required.methods,
          pkg('vite-plus/*'),
        ]),
      ),
    )
    .exposes((m) => ({ code: m.src }));

  const component = archetype('component')
    .identify({ marker: '{name}.dom.ts' })
    .requires({ testRunner, application: layer, ports: dir(), strings: dir(), icons: dir(), transition: files() })
    .contains((m, { required, self }) =>
      m
        .module('subcomponent', dir('{name}'), self)
        .module('logic', files('*.ts'), exposes(all()).using([required.strings, required.application]))
        .module(
          'dom',
          files('{name}.dom.ts'),
          exposes(all()).using((m) => [
            m.logic,
            m.subcomponent.render,
            required.icons,
            required.strings,
            required.transition,
            required.application,
            required.ports,
          ]),
        )
        .module(
          'dsl',
          files('*.dsl.ts'),
          exposes(all()).using((m) => [m.subcomponent.dsl, required.testRunner.contract]),
        )
        .module(
          'testPage',
          files('*.test-page.ts'),
          exposes(all()).using((m) => [m.subcomponent.testPage, pkg('vite-plus/*')]),
        )
        .module(
          'harness',
          files('*.harness.ts'),
          exposes(all()).using((m) => [
            m.dom,
            m.logic,
            m.dsl,
            m.testPage,
            required.testRunner.runner,
            required.testRunner.contract,
            required.application,
            required.ports,
            pkg('vite-plus/*'),
          ]),
        )
        .module(
          'test',
          files('*.test.ts'),
          using((m) => [
            m.logic,
            m.dom,
            m.harness,
            m.testPage,
            m.dsl,
            m.subcomponent.testPage,
            required.testRunner.runner,
            required.testRunner.contract,
            required.application,
            pkg('vite-plus/*'),
            pkg('@playwright/*'),
          ]),
        ),
    )
    .exposes((m) => ({ render: m.dom, testPage: m.testPage, dsl: m.dsl }));

  const ui = archetype('ui')
    .contains((m) =>
      m
        .module('components', dir('{name}'), component)
        .module('strings', dir('strings'), exposes(all()).description("The app's words"))
        .module('icons', dir('icons'), exposes(all()))
        .module('transition', files('transition.ts'), exposes(all()))
        .module(
          'test',
          files('*.test.ts'),
          using((m) => [m.transition, pkg('vite-plus/*')]),
        ),
    )
    .provides((m) => ({ strings: m.strings, icons: m.icons, transition: m.transition }))
    .exposes((m) => ({
      render: m.components.render,
      testPage: m.components.testPage,
      dsl: m.components.dsl,
      strings: m.strings,
    }));

  const journeys = archetype('journeys')
    .requires({ testRunner, ui })
    .contains((m, { required }) =>
      m.module('dsl', files('*.dsl.ts'), exposes(all()).using([required.testRunner.contract, required.ui.dsl])).module(
        'rest',
        files('**'),
        using((m) => [m.dsl, required.testRunner.runner, required.testRunner.contract, required.ui.dsl]),
      ),
    );

  const workingTitle = archetype('working-title')
    .contains((m) =>
      m
        .module('domain', dir('src/domain'), layer)
        .module(
          'ports',
          dir('src/ports'),
          exposes(all()).using((m) => [m.domain]),
        )
        .module(
          'methods',
          dir('src/methods'),
          exposes(all()).using((m) => [m.domain]),
        )
        .module(
          'application',
          dir('src/application'),
          layer.using((m) => [m.domain, m.ports]),
        )
        .module(
          'adapters',
          dir('src/adapters'),
          layer.using((m) => [m.domain, m.ports, pkg('*')]),
        )
        .module(
          'ui',
          dir('src/ui'),
          ui.using((m) => [m.application]),
        )
        .module('styles', files('src/*.css'), exposes(all()))
        .module(
          'shell',
          files('src/shell.ts'),
          exposes(all()).using((m) => [m.application, m.ui.strings]),
        )
        .module(
          'app',
          files('src/main.ts', 'src/app.ts'),
          exposes(all()).using((m) => [
            m.application,
            m.adapters,
            m.ports,
            m.methods,
            m.ui.render,
            m.ui.strings,
            m.shell,
            m.styles,
            pkg('virtual:*'),
          ]),
        )
        .module(
          'testRunner',
          dir('src/test-helpers'),
          testRunner.using((m) => [
            m.domain,
            m.application,
            m.adapters,
            m.methods,
            m.app,
            m.shell,
            m.ui.render,
            m.ui.testPage,
            m.ports,
            pkg('*'),
          ]),
        )
        .module(
          'e2e',
          dir('e2e'),
          journeys.using((m) => [m.adapters, m.ui.testPage, pkg('*')]),
        )
        .module('lint', dir('lint'), layer.using([pkg('*')]))
        .module(
          'tooling',
          files('*.ts', 'scripts/**/*.ts'),
          using((m) => [m.lint, pkg('*')]),
        ),
    )
    .provides((m) => ({
      testRunner: m.testRunner,
      application: m.application,
      ports: m.ports,
      methods: m.methods,
      ui: m.ui,
    }));

  return defineConfig({ root: workingTitle });
};

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
  .contains((m) =>
    m.module('dom', files('*.dom.ts'), exposes(all())).module('page', files('*.page.ts'), exposes(all())),
  )
  .exposes((m) => ({ render: m.dom, pages: [m.page, m.dom] }));

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
      'working-title.ports',
      'working-title.methods',
      'component',
      'ui.strings',
      'ui.icons',
    ]);
  });

  it('turns every step of the chain into plain data', () => {
    const match = () => false as const;
    const root = archetype('root')
      .description('the project')
      .contains((m) =>
        m
          .module('strings', dir('strings'), exposes(all()).description('words'))
          .module(
            'kids',
            dir('kids/{name}', 'more/{name}'),
            kid.using((m) => [m.strings, pkg('lit')]),
          )
          .module(
            'main',
            files('main.ts'),
            exposes(files('main.ts')).using((m) => [m.kids.render, m.kids]),
          )
          .module(
            'core',
            dir('core'),
            archetype()
              .contains((q) => q.module('ports', files('ports.ts'), exposes(all())))
              .exposes((m) => ({ ports: m.ports })),
          ),
      )
      .exposes((m) => ({ main: m.main }))
      .provides((m) => ({ strings: m.strings }));
    const node = archetype('node')
      .identify({ match })
      .requires({ strings: dir() })
      .contains((m, { required, self }) =>
        m.module('child', dir('{name}'), self).module('src', files('**'), using([required.strings])),
      );
    const config = defineConfig({
      root: archetype('top')
        .contains((m) =>
          m
            .module('words', dir('words'), exposes(all()))
            .module('root', dir('root'), root)
            .module('nodes', dir('nodes'), node),
        )
        .provides((m) => ({ strings: m.words })),
      tsconfig: ['tsconfig.json', 'tsconfig.test.json'],
      rulesets: {
        default: ruleset()
          .rules('off')
          .on(root, { '*': false, 'cognitive-complexity': { max: 10 } })
          .on(root.modules.main, { 'file-cohesion': false }),
      },
    });
    const { config: data, warnings } = loadConfigData(config);
    assert.deepEqual(warnings, ['root provides strings, which nothing below requires']);
    assert.deepEqual(data, {
      root: 'top',
      archetypes: {
        top: {
          name: 'top',
          requires: {},
          modules: [
            { kind: 'dir', name: 'words', using: [], paths: ['words'], archetype: 'top.words' },
            { kind: 'dir', name: 'root', using: [], paths: ['root'], archetype: 'root' },
            { kind: 'dir', name: 'nodes', using: [], paths: ['nodes'], archetype: 'node' },
          ],
          provides: { strings: { kind: 'module', module: 'words' } },
        },
        root: {
          name: 'root',
          description: 'the project',
          requires: {},
          modules: [
            {
              kind: 'dir',
              name: 'strings',
              using: [],
              description: 'words',
              paths: ['strings'],
              archetype: 'root.strings',
            },
            {
              kind: 'dir',
              name: 'kids',
              using: [
                { kind: 'module', module: 'strings' },
                { kind: 'package', pattern: 'lit' },
              ],
              paths: ['kids/{name}', 'more/{name}'],
              archetype: 'kid',
            },
            {
              kind: 'files',
              name: 'main',
              using: [
                { kind: 'module', module: 'kids', surface: 'render' },
                { kind: 'module', module: 'kids' },
              ],
              patterns: ['main.ts'],
              exposes: { kind: 'files', patterns: ['main.ts'] },
              rules: { 'file-cohesion': false },
            },
            { kind: 'dir', name: 'core', using: [], paths: ['core'], archetype: 'root.core' },
          ],
          exposes: { kind: 'surfaces', surfaces: { main: [{ kind: 'module', module: 'main' }] } },
          provides: { strings: { kind: 'module', module: 'strings' } },
          rules: { '*': false, 'cognitive-complexity': { max: 10 } },
        },
        node: {
          name: 'node',
          identify: { match },
          requires: { strings: { kind: 'dir' } },
          modules: [
            { kind: 'dir', name: 'child', using: [], paths: ['{name}'], archetype: 'node' },
            { kind: 'files', name: 'src', using: [{ kind: 'required', name: 'strings' }], patterns: ['**'] },
          ],
          provides: {},
        },
        'top.words': {
          name: 'top.words',
          inline: true,
          requires: {},
          modules: [],
          exposes: { kind: 'all' },
          provides: {},
        },
        kid: {
          name: 'kid',
          requires: {},
          modules: [
            { kind: 'files', name: 'dom', using: [], patterns: ['*.dom.ts'], exposes: { kind: 'all' } },
            { kind: 'files', name: 'page', using: [], patterns: ['*.page.ts'], exposes: { kind: 'all' } },
          ],
          exposes: {
            kind: 'surfaces',
            surfaces: {
              render: [{ kind: 'module', module: 'dom' }],
              pages: [
                { kind: 'module', module: 'page' },
                { kind: 'module', module: 'dom' },
              ],
            },
          },
          provides: {},
        },
        'root.strings': {
          name: 'root.strings',
          inline: true,
          requires: {},
          modules: [],
          exposes: { kind: 'all' },
          provides: {},
        },
        'root.core': {
          name: 'root.core',
          inline: true,
          requires: {},
          modules: [{ kind: 'files', name: 'ports', using: [], patterns: ['ports.ts'], exposes: { kind: 'all' } }],
          exposes: { kind: 'surfaces', surfaces: { ports: [{ kind: 'module', module: 'ports' }] } },
          provides: {},
        },
      },
      tsconfig: ['tsconfig.json', 'tsconfig.test.json'],
      rules: 'off',
    });
  });

  it('defaults tsconfig to tsconfig.json', () => {
    const { config } = loadConfigData({ root: archetype('a').contains((m) => m.module('src', files('**'))) });
    assert.deepEqual(config.tsconfig, ['tsconfig.json']);
    assert.equal(
      loadConfigData({ root: archetype('a'), tsconfig: 'tsconfig.app.json' }).config.tsconfig[0],
      'tsconfig.app.json',
    );
  });

  it('answers a requirement with the nearest provider above, down a recursive archetype', () => {
    const leaf = archetype('leaf')
      .requires({ icons: dir() })
      .contains((m, { required, self }) =>
        m.module('sub', dir('{name}'), self).module('src', files('**'), using([required.icons])),
      );
    const middle = archetype('middle')
      .contains((m) => m.module('icons', dir('icons'), exposes(all())).module('leaves', dir('{name}'), leaf))
      .provides((m) => ({ icons: m.icons }));
    const top = archetype('top')
      .contains((m) => m.module('icons', dir('icons'), exposes(all())).module('middle', dir('middle'), middle))
      .provides((m) => ({ icons: m.icons }));
    assert.deepEqual(loadConfigData({ root: top }).warnings, ['top provides icons, which nothing below requires']);
  });

  it('warns about a provision that nothing below requires', () => {
    const root = archetype('root')
      .contains((m) =>
        m
          .module('strings', dir('strings'), exposes(all()))
          .module('transition', files('transition.ts'), exposes(all())),
      )
      .provides((m) => ({ strings: m.strings, transition: m.transition }));
    assert.deepEqual(loadConfigData({ root }).warnings, [
      'root provides strings, which nothing below requires',
      'root provides transition, which nothing below requires',
    ]);
  });

  it('refuses a requirement that nothing above provides, once per archetype', () => {
    const component = archetype('component')
      .requires({ icons: dir() })
      .contains((m, { required, self }) =>
        m.module('sub', dir('{name}'), self).module('dom', files('*.dom.ts'), using([required.icons])),
      );
    const ui = archetype('ui').contains((m) => m.module('components', dir('{name}'), component));
    const root = archetype('app').contains((m) => m.module('ui', dir('src/ui'), ui));
    assert.deepEqual(failures({ root }), ['ui.components (component) requires icons, which nothing above it provides']);
  });

  it('refuses a requirement on the root, which has nothing above it', () => {
    const root = archetype('app')
      .requires({ icons: dir() })
      .contains((m, { required }) => m.module('src', files('**'), using([required.icons])));
    assert.deepEqual(failures({ root }), ['app requires icons, which nothing above it provides']);
  });

  it('refuses a provider whose module does not fit the requirement', () => {
    const layer = archetype('layer')
      .contains((m) => m.module('src', files('**')))
      .exposes(all());
    const other = archetype('other')
      .contains((m) => m.module('src', files('**')))
      .exposes(all());
    const child = archetype('child')
      .requires({ application: layer, strings: dir(), transition: files() })
      .contains((m, { required }) =>
        m.module('src', files('**'), using([required.application, required.strings, required.transition])),
      );
    const root = archetype('root')
      .contains((m) =>
        m
          .module('application', dir('src/application'), other)
          .module('strings', files('strings.ts'), exposes(all()))
          .module('transition', dir('transition'), exposes(all()))
          .module('child', dir('child'), child),
      )
      .provides((m) => ({ application: m.application, strings: m.strings, transition: m.transition }));
    assert.deepEqual(failures({ root }), [
      'child (child) requires application as modules of layer; root provides application from application, modules of other',
      'child (child) requires strings as dir(); root provides strings from strings, a files module',
      'child (child) requires transition as files(); root provides transition from transition, a dir module',
    ]);
  });

  it('accepts each kind of provider for the requirement it fits', () => {
    const layer = archetype('layer')
      .contains((m) => m.module('src', files('**')))
      .exposes(all());
    const child = archetype('child')
      .requires({ application: layer, strings: dir(), transition: files() })
      .contains((m, { required }) =>
        m.module('src', files('**'), using([required.application, required.strings, required.transition])),
      );
    const root = archetype('root')
      .contains((m) =>
        m
          .module('application', dir('src/application'), layer)
          .module('strings', dir('strings'), exposes(all()))
          .module('transition', files('transition.ts'), exposes(all()))
          .module('child', dir('child'), child),
      )
      .provides((m) => ({ application: m.application, strings: m.strings, transition: m.transition }));
    assert.deepEqual(loadConfigData({ root }).warnings, []);
  });

  it('refuses a requirement that no module lists in using', () => {
    const child = archetype('child')
      .requires({ icons: dir(), strings: dir() })
      .contains((m, { required }) => m.module('src', files('**'), using([required.icons])));
    const root = archetype('root')
      .contains((m) =>
        m
          .module('icons', dir('icons'), exposes(all()))
          .module('strings', dir('strings'), exposes(all()))
          .module('child', dir('child'), child),
      )
      .provides((m) => ({ icons: m.icons, strings: m.strings }));
    assert.deepEqual(failures({ root }), ['child requires strings, which no module lists in using']);
  });

  it('refuses two archetypes with one name', () => {
    const a = archetype('same').contains((m) => m.module('a', files('a.ts')));
    const b = archetype('same').contains((m) => m.module('b', files('b.ts')));
    const root = archetype('root').contains((m) => m.module('a', dir('a'), a).module('b', dir('b'), b));
    assert.deepEqual(failures({ root }), ['two archetypes are named same: give each its own name']);
  });

  it('checks rule ids against the registered rules and unclassified', () => {
    const root = archetype('root').contains((m) => m.module('src', files('**')).module('test', files('*.test.ts')));
    const rules = ruleset()
      .rules({ 'cognitive-complexity': { max: 3 }, unclassified: false })
      .on(root.modules.test, { '*': false, 'no-such-rule': false });
    assert.deepEqual(
      failures(
        { root, rulesets: { default: rules } },
        { builtins: [builtinRegistry.get('file-cohesion')!, builtinRegistry.get('cognitive-complexity')!] },
      ),
      ['rulesets.default.on(root.modules.test): no rule called no-such-rule'],
    );
  });

  it("checks each rule's options with the check it is given", () => {
    const root = archetype('root').contains((m) => m.module('src', files('**')).module('test', files('*.test.ts')));
    const rules = ruleset()
      .rules({ 'dependency-direction': { strict: true }, 'file-cohesion': { maxLines: 0 } })
      .on(root, { 'no-cycle': { types: 'count', depth: 1, width: 2 }, 'module-cycle': { types: 'ignore' } })
      .on(root.modules.src, { 'module-cycle': { types: 'sometimes' } })
      .on(root.modules.test, { 'no-cycle': { types: 'count' }, 'module-cycle': {} });
    const options = { builtins: [...builtinRegistry.values()] };
    assert.deepEqual(failures({ root, rulesets: { default: rules } }, options), [
      'rulesets.default.rules.dependency-direction: unknown key strict',
      'rulesets.default.rules.file-cohesion.maxLines: expected a whole number of at least 1',
      'rulesets.default.on(root).no-cycle: unknown key depth, width',
      "rulesets.default.on(root.modules.src).module-cycle.types: expected 'count' or 'ignore'",
    ]);
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
    assert.throws(() => loadConfigData({ root, rulesets: { default: rules } }, thrower), TypeError);
  });

  it("joins plugins' rules to the built-in ones under their namespace, ids and options checked alike", () => {
    const limit: FileRule<{ max: number }> = {
      id: 'max-imports',
      defaults: { max: 5 },
      parseOptions: wholeNumberOptions({ max: 5 }),
      check: () => [],
    };
    const root = archetype('root').contains((m) => m.module('src', files('**')));
    const rules = ruleset().on(root.modules.src, { 'mine/max-imports': { max: 0 }, 'max-imports': false });
    const builtins = [builtinRegistry.get('file-cohesion')!];
    assert.deepEqual(
      failures({ root, plugins: { mine: { rules: [limit] } }, rulesets: { default: rules } }, { builtins }),
      [
        'rulesets.default.on(root.modules.src).mine/max-imports.max: expected a whole number of at least 1',
        'rulesets.default.on(root.modules.src): no rule called max-imports',
      ],
    );
    const { rules: registered } = loadConfigData(
      { root: archetype('r'), plugins: { mine: { rules: [limit] } } },
      { builtins },
    );
    assert.deepEqual(
      registered.map((rule) => rule.id),
      ['file-cohesion', 'mine/max-imports'],
    );
  });

  it('refuses rule settings of the wrong shape', () => {
    const root = archetype('root').contains((m) => m.module('src', files('**')));
    const rules = ruleset()
      .on(root, { '*': {}, 'file-cohesion': 3 as never, 'cognitive-complexity': pkg('x') as never })
      .on(root.modules.src, 'all' as never);
    assert.deepEqual(failures({ root, rulesets: { default: rules } }), [
      'rulesets.default.on(root).*: expected true, false',
      'rulesets.default.on(root).file-cohesion: expected true, false or options',
      'rulesets.default.on(root).cognitive-complexity: expected true, false or options',
      "rulesets.default.on(root.modules.src): expected 'off' or rule settings by id",
    ]);
  });

  it('refuses a malformed config, root and requirements', () => {
    assert.throws(() => loadConfigData(undefined), /config: expected an object, defineConfig\(\{ root \}\)/);
    assert.throws(() => loadConfigData({ root: {} }), /config\.root: expected an archetype/);
    const root = archetype('root')
      .requires({ x: 'nope' as never })
      .contains((m) => m.module('src', files('**')));
    assert.deepEqual(failures({ root, layers: {}, exclude: [], tsconfig: [], plugins: [] }), [
      'config: unknown key layers, exclude',
      'config.plugins: expected plugins by namespace',
      'root.requires.x: expected an archetype, dir() or files()',
      'config.tsconfig: expected a path or a list of paths',
    ]);
    assert.deepEqual(failures({ root: archetype('r').requires(3 as never) }), [
      'r.requires: expected requirements by name, { testRunner, strings: dir() }',
    ]);
  });

  it('refuses malformed steps of the chain', () => {
    const root = archetype('root')
      .identify({ marker: '' })
      .description(3 as never)
      .contains((m) =>
        m
          .module('', files('*.ts'))
          .module('a.b', files('*.ts'))
          .module(3 as never, files('*.ts'))
          .module('empty', files() as never)
          .module('blank', files('src/*.ts', ''))
          .module('number', files(3 as never))
          .module('nowhere', dir(''))
          .module('bad', dir('x'), 'options' as never)
          .module('odd', files('odd.ts'), { usin: [], uses: [] } as never)
          .module(
            'flat',
            files('flat.ts'),
            archetype()
              .description(1 as never)
              .using(pkg('x') as never),
          )
          .module('notRef', files('n.ts'), using(['src'] as never))
          .module('typed', files('t.ts'), self as never)
          // @ts-expect-error a module takes no fourth argument
          .module('twice', dir('t'), using([]), using([]))
          .module('stray', files('s.ts'), archetype().contains((q) => q.module('x', files('x.ts'))) as never)
          .module('open', files('o.ts'), exposes('some' as never))
          .module('needy', dir('needy'), archetype().requires({ icons: dir() }))
          // @ts-expect-error a named archetype makes a folder module
          .module('named', files('n.ts'), archetype('named')),
      )
      .exposes('some' as never)
      .provides(3 as never);
    assert.deepEqual(failures({ root }), [
      'root.description: expected a string',
      "root.identify: expected { marker: '{name}.dom.ts' } or { match: (dir, chain) => ... }",
      'root: a module\'s name is a non-empty string without dots, not ""',
      'root: a module\'s name is a non-empty string without dots, not "a.b"',
      "root: a module's name is a non-empty string without dots, not 3",
      "root.empty: expected a selector, files('*.ts') or dir('src/ui')",
      'root.blank: files() takes non-empty strings',
      'root.number: files() takes non-empty strings',
      'root.nowhere: dir() takes non-empty strings',
      'root.bad: expected an archetype, such as component, using(...) or exposes(all())',
      'root.odd: expected an archetype, such as component, using(...) or exposes(all())',
      'root.flat.using: expected a list of references, or a callback returning one',
      'root.flat.description: expected a string',
      'root.typed: an archetype makes a folder module; use dir(...), not files(...)',
      'root.twice: .module() takes a name, a selector and an archetype',
      'root.stray.contains: a files module has no modules; use dir(...) for contains',
      "root.open.exposes: expected all() or files('a.ts', ...)",
      "root.needy.requires: a module's own archetype sees what its holder requires; name the archetype to require more",
      'root.named: an archetype makes a folder module; use dir(...), not files(...)',
      "root.exposes: expected all(), files('a.ts', ...) or (m) => ({ render: m.dom })",
      'root.provides: expected a callback returning modules by name, (m) => ({ strings: m.strings })',
      "root.notRef uses something other than a reference: use s.module, required.name or pkg('name')",
    ]);
  });

  it('refuses a dir path that is not folder names and whole-segment placeholders', () => {
    const root = archetype('root').contains((m) =>
      m
        .module('fine', dir('src/ui', '{name}', 'src/{name}/x', 'src/__testHelpers__'))
        .module('glob', dir('src/*'))
        .module('partial', dir('src/{name}-x'))
        .module('up', dir('../x'))
        .module('here', dir('./x'))
        .module('empty', dir('src//x'))
        .module('rooted', dir('/src')),
    );
    assert.deepEqual(
      failures({ root }),
      ['src/*', 'src/{name}-x', '../x', './x', 'src//x', '/src'].map(
        (path, index) =>
          `root.${['glob', 'partial', 'up', 'here', 'empty', 'rooted'][index]}: a dir path is folder names and {placeholders}, a whole segment each, not '${path}'`,
      ),
    );
  });

  it('refuses callbacks that return the wrong thing', () => {
    const root = archetype('root')
      .contains(() => undefined as never)
      .exposes(() => 'all' as never)
      .provides(() => null as never);
    assert.deepEqual(failures({ root }), [
      'root.contains: expected the modules chain, (m) => m.module(...)',
      "root.exposes: expected all(), files('a.ts', ...) or (m) => ({ render: m.dom })",
      'root.provides: expected a callback returning modules by name, (m) => ({ strings: m.strings })',
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
      .contains((m) => m.module('src', files('**')))
      .exposes(() => ({}));
    const root = archetype('root')
      .requires({ icons: dir(), strings: dir(), both })
      .contains((m, { required }) =>
        m.module(
          'src',
          files('**'),
          // @ts-expect-error both exposes nothing
          using([pkg(''), required.icons, required.strings, required.both.api, required.nope as never]),
        ),
      );
    assert.deepEqual(failures({ root }), [
      "root.src uses pkg(''); a package pattern is a non-empty string",
      'root.src uses required.both.api; required.both (both) exposes nothing',
      'root.src uses required.nope; root requires icons, strings, both',
    ]);
  });

  it('reports a repeated mistake once', () => {
    const root = archetype('root').contains((m) =>
      m.module('src', files('**'), using([requiredOf().icons, requiredOf().icons])),
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
    assert.deepEqual(loadConfigData({ root: archetype('r').contains((m) => m.module('src', files('**'))) }).config, {
      root: 'r',
      archetypes: {
        r: {
          name: 'r',
          requires: {},
          modules: [{ kind: 'files', name: 'src', patterns: ['**'], using: [] }],
          provides: {},
        },
      },
      tsconfig: ['tsconfig.json'],
    });
  });

  it('reports a misfit once per message, and a missing requirement once per archetype', () => {
    const child = archetype('child')
      .requires({ strings: dir(), icons: dir() })
      .contains((m, { required }) => m.module('src', files('**'), using([required.strings, required.icons])));
    const middle = archetype('middle')
      .contains((m) => m.module('other', dir('other'), exposes(all())).module('child', dir('child'), child))
      .provides((m) => ({ other: m.other }));
    const root = archetype('root')
      .contains((m) =>
        m
          .module('strings', files('strings.ts'), exposes(all()))
          .module('middle', dir('middle'), middle)
          .module('child', dir('child'), child),
      )
      .provides((m) => ({ strings: m.strings }));
    assert.deepEqual(failures({ root }), [
      'middle.child (child) requires strings as dir(); root provides strings from strings, a files module',
      'middle.child (child) requires icons, which nothing above it provides',
      'child (child) requires strings as dir(); root provides strings from strings, a files module',
    ]);
  });

  it('checks an archetype again under a different provider', () => {
    const child = archetype('child')
      .requires({ strings: dir() })
      .contains((m, { required }) => m.module('src', files('**'), using([required.strings])));
    const middle = archetype('middle')
      .contains((m) => m.module('strings', dir('strings'), exposes(all())).module('child', dir('child'), child))
      .provides((m) => ({ strings: m.strings }));
    const root = archetype('root')
      .contains((m) =>
        m
          .module('strings', files('strings.ts'), exposes(all()))
          .module('middle', dir('middle'), middle)
          .module('child', dir('child'), child),
      )
      .provides((m) => ({ strings: m.strings }));
    assert.deepEqual(failures({ root }), [
      'child (child) requires strings as dir(); root provides strings from strings, a files module',
    ]);
  });

  it('refuses a reference to a module that exposes nothing, naming what to open', () => {
    const closed = archetype('closed').contains((m) => m.module('src', files('**')));
    const root = archetype('root')
      .contains((m) =>
        m
          .module('quiet', files('quiet.ts'))
          .module('folder', dir('folder'))
          .module('kids', dir('kids/{name}'), closed)
          .module(
            'main',
            files('main.ts'),
            using((m) => [m.quiet, m.folder, m.kids]),
          ),
      )
      .provides((m) => ({ quiet: m.quiet }));
    assert.deepEqual(failures({ root }), [
      'root.main uses quiet; quiet exposes nothing: give quiet exposes, or drop the reference',
      'root.main uses folder; folder exposes nothing: give folder exposes, or drop the reference',
      'root.main uses kids; kids (closed) exposes nothing: give closed exposes, or drop the reference',
      'root provides quiet as quiet; quiet exposes nothing: give quiet exposes, or drop the reference',
    ]);
  });

  it('refuses a named surface on a module that exposes files rather than surfaces', () => {
    const open = archetype('open')
      .contains((m) => m.module('src', files('**')))
      .exposes(all());
    const root = archetype('root').contains((m) =>
      m
        .module('lib', files('lib/*.ts'), exposes(files('index.ts')))
        .module('kids', dir('kids/{name}'), open)
        .module(
          'main',
          files('main.ts'),
          using((m) => [
            // @ts-expect-error lib exposes files, not named surfaces
            m.lib.api,
            // @ts-expect-error kids exposes all its files, not named surfaces
            m.kids.render,
          ]),
        ),
    );
    assert.deepEqual(failures({ root }), [
      "root.main uses lib.api; lib exposes files('index.ts'), not named surfaces",
      'root.main uses kids.render; kids (open) exposes all its files, not named surfaces',
    ]);
  });

  it('refuses a duplicate module and an archetype without a name', () => {
    const nameless = archetype('' as string).contains((m) => m.module('a', files('a.ts')));
    const numbered = archetype(3 as never);
    const root = archetype('root').contains((m) =>
      m
        .module('src', files('**'))
        .module('src' as never, files('x.ts'))
        .module('n', dir('n'), nameless)
        .module('m', dir('m'), numbered)
        .module(
          'x',
          files('x.ts'),
          // @ts-expect-error nameless has no .exposes()
          using((m) => [m.n.render]),
        ),
    );
    assert.deepEqual(failures({ root }), [
      'archetype(""): a name is a non-empty string',
      'archetype(3): a name is a non-empty string',
      "root: module 'src' is already declared",
      'root.x uses n.render; n () exposes nothing: give  exposes, or drop the reference',
    ]);
  });

  it('accepts identify by marker or match', () => {
    const { config } = loadConfigData({ root: archetype('r').identify({ marker: '{name}.ts' }) });
    assert.deepEqual(config.archetypes.r, {
      name: 'r',
      identify: { marker: '{name}.ts' },
      requires: {},
      modules: [],
      provides: {},
    });
    assert.match(
      failures({ root: archetype('r').identify({ marker: 'a', match: () => false } as never) })[0]!,
      /identify/,
    );
  });
});
