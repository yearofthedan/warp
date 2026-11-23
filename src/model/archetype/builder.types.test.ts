import assert from 'node:assert/strict';
import { describe, expectTypeOf, it } from 'vite-plus/test';
import { ConfigError } from '../configError.ts';
import {
  all,
  type AnyArchetype,
  archetype,
  defineConfig,
  dir,
  exposes,
  files,
  pkg,
  ruleset,
  using,
} from './builder.ts';
import { loadConfigData } from '../../app/load.ts';

const archetypes = () => {
  const testRunner = archetype('test-runner')
    .contains((m) =>
      m.module('contract', files('driver.ts'), exposes(all())).module(
        'runner',
        files('**'),
        exposes(all()).using((m) => [m.contract]),
      ),
    )
    .exposes((m) => ({ contract: m.contract, runner: m.runner }));

  const kid = archetype('kid')
    .contains((m) =>
      m.module('dom', files('*.dom.ts'), exposes(all())).module('page', files('*.page.ts'), exposes(all())),
    )
    .exposes((m) => ({ render: m.dom, pages: m.page }));

  const plainKid = archetype('plain-kid').contains((m) => m.module('src', files('**')));
  return { testRunner, kid, plainKid };
};

const errorsIn = (child: AnyArchetype, testRunner: AnyArchetype = archetypes().testRunner): string[] => {
  const root = archetype('host')
    .contains((m) =>
      m
        .module('testRunner', dir('test-helpers'), testRunner)
        .module('strings', dir('strings'), exposes(all()))
        .module('child', dir('child'), child),
    )
    .provides((m) => ({ testRunner: m.testRunner, strings: m.strings }));
  try {
    loadConfigData({ root });
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  return [];
};

describe('archetype builders', () => {
  it('type and load a component tree with requirements and providers', () => {
    const runner = archetype('test-runner')
      .contains((m) => m.module('runner', files('**'), exposes(all())))
      .exposes((m) => ({ runner: m.runner }));
    const component = archetype('component')
      .identify({ marker: '{name}.dom.ts' })
      .requires({ testRunner: runner, application: dir(), strings: dir(), icons: dir() })
      .contains((m, { required, self }) =>
        m
          .module('subcomponent', dir('{name}'), self)
          .module('logic', files('*.ts'), exposes(all()).using([required.application, required.strings]))
          .module(
            'dom',
            files('{name}.dom.ts'),
            exposes(all()).using((m) => [
              m.logic,
              m.subcomponent.render,
              required.application,
              required.icons,
              required.strings,
            ]),
          )
          .module(
            'testPage',
            files('*.test-page.ts'),
            exposes(all()).using((m) => [m.dom, m.subcomponent.testPage]),
          )
          .module(
            'test',
            files('*.test.ts'),
            using((m) => [m.logic, m.dom, m.testPage, required.testRunner]),
          ),
      )
      .exposes((m) => ({ render: m.dom, testPage: m.testPage }));
    const ui = archetype('ui')
      .contains((m) =>
        m
          .module('strings', dir('strings'), exposes(all()))
          .module('icons', dir('icons'), exposes(all()))
          .module('components', dir('{name}'), component),
      )
      .provides((m) => ({ strings: m.strings, icons: m.icons }))
      .exposes((m) => ({ render: m.components.render, testPage: m.components.testPage }));
    const app = archetype('app')
      .contains((m) =>
        m
          .module('domain', dir('src/domain'), exposes(all()))
          .module(
            'application',
            dir('src/application'),
            exposes(all()).using((m) => [m.domain]),
          )
          .module('ui', dir('src/ui'), ui)
          .module(
            'main',
            files('src/main.ts'),
            using((m) => [m.application, m.ui.render]),
          )
          .module(
            'testRunner',
            dir('src/test-helpers'),
            runner.using((m) => [m.domain, m.application, m.ui.testPage]),
          ),
      )
      .provides((m) => ({ testRunner: m.testRunner, application: m.application }));
    const base = ruleset().rules({ 'cognitive-complexity': { max: 15 } });
    const config = defineConfig({ root: app, rulesets: { default: base } });
    assert.deepEqual(loadConfigData(config).warnings, []);
  });

  it('offer the modules above, the requirements and the surfaces as completions', () => {
    const { testRunner, kid } = archetypes();
    archetype('c')
      .requires({ testRunner, strings: dir(), transition: files() })
      .contains((m, { required, self }) => {
        expectTypeOf<keyof typeof required>().toEqualTypeOf<'testRunner' | 'strings' | 'transition'>();
        expectTypeOf<Exclude<keyof typeof required.testRunner, symbol>>().toEqualTypeOf<'contract' | 'runner'>();
        return m
          .module('sub', dir('{name}'), self)
          .module('kids', dir('kids/{name}'), kid)
          .module(
            'logic',
            files('*.ts'),
            using((m) => {
              expectTypeOf<keyof typeof m>().toEqualTypeOf<'sub' | 'kids'>();
              expectTypeOf<Exclude<keyof typeof m.kids, symbol>>().toEqualTypeOf<'render' | 'pages'>();
              expectTypeOf<Exclude<keyof typeof m.sub, symbol>>().toEqualTypeOf<string | number>();
              return [required.strings, required.transition, required.testRunner.runner, m.kids.render];
            }),
          );
      })
      .exposes((m) => {
        expectTypeOf<keyof typeof m>().toEqualTypeOf<'sub' | 'kids' | 'logic'>();
        return { logic: m.logic };
      });
  });

  it('refuse a misspelt module', () => {
    const child = archetype('c').contains((m) =>
      m.module('logic', files('*.ts')).module(
        'a',
        files('a.ts'),
        // @ts-expect-error misspelt module
        using((m) => [m.lgoic]),
      ),
    );
    assert.deepEqual(errorsIn(child), ['c.a uses lgoic; a sees logic']);
  });

  it('refuse a module declared further down', () => {
    const child = archetype('c').contains((m) =>
      m
        .module('logic', files('*.ts'))
        .module(
          'b',
          files('b.ts'),
          // @ts-expect-error module declared further down
          using((m) => [m.later]),
        )
        .module('later', files('later.ts')),
    );
    assert.deepEqual(errorsIn(child), ['c.b uses later; later is declared below b, which sees logic']);
  });

  it('refuse a module that names itself', () => {
    const child = archetype('c').contains((m) =>
      m.module(
        'a',
        files('a.ts'),
        // @ts-expect-error a module is not among the modules above it
        using((m) => [m.a]),
      ),
    );
    assert.deepEqual(errorsIn(child), ['c.a uses a; a module reaches its own files already; a sees no modules']);
  });

  it('refuse a requirement the archetype does not declare', () => {
    const { testRunner } = archetypes();
    const child = archetype('c')
      .requires({ testRunner })
      .contains((m, { required }) =>
        // @ts-expect-error undeclared requirement
        m.module('a', files('a.ts'), using([required.testRunner, required.icons])),
      );
    assert.deepEqual(errorsIn(child, testRunner), ['c.a uses required.icons; c requires testRunner']);
  });

  it("refuse a misspelt surface of a requirement or a child's archetype", () => {
    const { testRunner, kid } = archetypes();
    const child = archetype('c')
      .requires({ testRunner })
      .contains((m, { required }) =>
        m
          .module('kids', dir('kids/{name}'), kid)
          // @ts-expect-error misspelt requirement surface
          .module('c', files('c.ts'), using([required.testRunner.runer]))
          .module(
            'e',
            files('e.ts'),
            // @ts-expect-error misspelt child surface
            using((m) => [m.kids.rendr]),
          ),
      );
    assert.deepEqual(errorsIn(child, testRunner), [
      'c.c uses required.testRunner.runer; required.testRunner (test-runner) exposes contract, runner',
      'c.e uses kids.rendr; kids (kid) exposes render, pages',
    ]);
  });

  it('type any self surface, and refuse a misspelt one when the config loads', () => {
    const component = archetype('component')
      .contains((m, { self }) =>
        m
          .module('subcomponent', dir('{name}'), self)
          .module('logic', files('*.ts'), exposes(all()))
          .module('testPage', files('*.test-page.ts'), exposes(all()))
          .module(
            'dom',
            files('{name}.dom.ts'),
            exposes(all()).using((m) => [m.logic, m.subcomponent.rendr]),
          ),
      )
      .exposes((m) => ({ render: m.dom, testPage: m.testPage }));
    assert.deepEqual(errorsIn(component), [
      'component.dom uses subcomponent.rendr; subcomponent exposes render, testPage',
    ]);
  });

  it('refuse a surface on a module or requirement that has none', () => {
    const { plainKid } = archetypes();
    const child = archetype('c')
      .requires({ strings: dir() })
      .contains((m, { required }) =>
        m
          .module('logic', files('*.ts'), using([required.strings]))
          .module('folder', dir('folder'))
          .module('plain', dir('plain/{name}'), plainKid)
          .module(
            'a',
            files('a.ts'),
            // @ts-expect-error a files module has no surfaces
            using((m) => [m.logic.render]),
          )
          .module(
            'b',
            files('b.ts'),
            // @ts-expect-error a dir module that exposes nothing has no surfaces
            using((m) => [m.folder.render]),
          )
          .module(
            'c',
            files('c.ts'),
            // @ts-expect-error an archetype with no .exposes() names no surfaces
            using((m) => [m.plain.render]),
          )
          // @ts-expect-error dir() has no surfaces
          .module('d', files('d.ts'), using([required.strings.render])),
      );
    assert.deepEqual(errorsIn(child), [
      'c.a uses logic.render; logic exposes nothing: give logic exposes, or drop the reference',
      'c.b uses folder.render; folder exposes nothing: give folder exposes, or drop the reference',
      'c.c uses plain.render; plain (plain-kid) exposes nothing: give plain-kid exposes, or drop the reference',
      'c.d uses required.strings.render; required.strings is dir(), which has no surfaces',
    ]);
  });

  it('refuse a module declared twice', () => {
    const child = archetype('c').contains((m) =>
      m
        .module('logic', files('*.ts'))
        // @ts-expect-error duplicate module
        .module('logic', files('x.ts')),
    );
    assert.deepEqual(errorsIn(child), ["c: module 'logic' is already declared"]);
  });

  it('keep s typed in both dir overloads', () => {
    const { kid } = archetypes();
    const child = archetype('c').contains((m) =>
      m
        .module('domain', dir('src/domain'), exposes(all()))
        .module(
          'ports',
          dir('src/ports'),
          exposes(all()).using((m) => [m.domain]),
        )
        .module(
          'kids',
          dir('kids/{name}'),
          kid.using((m) => [m.ports]),
        )
        .module(
          'x',
          dir('x'),
          // @ts-expect-error misspelt module in the options overload
          using((m) => [m.domian]),
        )
        .module(
          'y',
          dir('y'),
          // @ts-expect-error misspelt module in the archetype overload
          kid.using((m) => [m.prots]),
        ),
    );
    assert.deepEqual(errorsIn(child), [
      'c.x uses domian; x sees domain, ports, kids',
      'c.y uses prots; y sees domain, ports, kids, x',
    ]);
  });

  it('refuse what exposes and provides cannot name', () => {
    const { kid } = archetypes();
    const child = archetype('c')
      .contains((m) => m.module('dom', files('*.dom.ts')).module('kids', dir('{name}'), kid))
      // @ts-expect-error a surface names modules, not packages
      .exposes((m) => ({ render: m.dmo, lib: pkg('lit') }))
      .provides((m) => ({ render: m.kids.render }));
    assert.deepEqual(errorsIn(child), [
      'c exposes render as dmo; c has modules dom, kids',
      "c exposes lib as pkg('lit'); exposes and provides name the archetype’s own modules",
      'c provides render as kids.render; name the whole module, without a surface',
    ]);
  });
});
