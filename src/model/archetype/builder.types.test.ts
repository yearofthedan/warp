import assert from 'node:assert/strict';
import { describe, expectTypeOf, it } from 'vite-plus/test';
import { ConfigError } from '../configError.ts';
import { type AnyArchetype, archetype, defineConfig, dir, files, pkg, ruleset } from './builder.ts';
import { loadConfigData } from '../../app/load.ts';

const testRunner = archetype('test-runner')
  .contains((p) => p.files('contract', 'driver.ts').files('runner', '**', { using: (s) => [s.contract] }))
  .exposes((s) => ({ contract: s.contract, runner: s.runner }));

const kid = archetype('kid')
  .contains((p) => p.files('dom', '*.dom.ts').files('page', '*.page.ts'))
  .exposes((s) => ({ render: s.dom, pages: s.page }));

const plainKid = archetype('plain-kid').contains((p) => p.files('src', '**'));

const errorsIn = (child: AnyArchetype): string[] => {
  const root = archetype('host')
    .contains((p) =>
      p.dir('testRunner', 'test-helpers', testRunner).dir('strings', 'strings').dir('child', 'child', child),
    )
    .provides((s) => ({ testRunner: s.testRunner, strings: s.strings }));
  try {
    loadConfigData({ root });
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  return [];
};

describe('archetype builders', () => {
  it('type and load the first example in the design doc', () => {
    const runner = archetype('test-runner')
      .contains((p) => p.files('runner', '**'))
      .exposes((s) => ({ runner: s.runner }));
    const component = archetype('component')
      .identify({ marker: '{name}.dom.ts' })
      .requires({ testRunner: runner, application: dir(), strings: dir(), icons: dir() })
      .contains((p, { required, self }) =>
        p
          .dir('subcomponent', '{name}', self)
          .files('logic', '*.ts', { using: [required.application, required.strings] })
          .files('dom', '{name}.dom.ts', {
            using: (s) => [s.logic, s.subcomponent.render, required.application, required.icons, required.strings],
          })
          .files('testPage', '*.test-page.ts', { using: (s) => [s.dom, s.subcomponent.testPage] })
          .files('test', '*.test.ts', { using: (s) => [s.logic, s.dom, s.testPage, required.testRunner] }),
      )
      .exposes((s) => ({ render: s.dom, testPage: s.testPage }));
    const ui = archetype('ui')
      .contains((p) => p.dir('strings', 'strings').dir('icons', 'icons').dir('components', '{name}', component))
      .provides((s) => ({ strings: s.strings, icons: s.icons }))
      .exposes((s) => ({ render: s.components.render, testPage: s.components.testPage }));
    const app = archetype('app')
      .contains((p) =>
        p
          .dir('domain', 'src/domain')
          .dir('application', 'src/application', { using: (s) => [s.domain] })
          .dir('ui', 'src/ui', ui)
          .files('main', 'src/main.ts', { using: (s) => [s.application, s.ui.render] })
          .dir('testRunner', 'src/test-helpers', runner, { using: (s) => [s.domain, s.application, s.ui.testPage] }),
      )
      .provides((s) => ({ testRunner: s.testRunner, application: s.application }));
    const base = ruleset().rules({ 'cognitive-complexity': { max: 15 } });
    const config = defineConfig({ root: app, rulesets: { default: base } });
    assert.deepEqual(loadConfigData(config).warnings, []);
  });

  it('offer the parts above, the requirements and the surfaces as completions', () => {
    archetype('c')
      .requires({ testRunner, strings: dir(), transition: files() })
      .contains((p, { required, self }) => {
        expectTypeOf<keyof typeof required>().toEqualTypeOf<'testRunner' | 'strings' | 'transition'>();
        expectTypeOf<Exclude<keyof typeof required.testRunner, symbol>>().toEqualTypeOf<'contract' | 'runner'>();
        return p
          .dir('sub', '{name}', self)
          .dir('kids', 'kids/{name}', kid)
          .files('logic', '*.ts', {
            using: (s) => {
              expectTypeOf<keyof typeof s>().toEqualTypeOf<'sub' | 'kids'>();
              expectTypeOf<Exclude<keyof typeof s.kids, symbol>>().toEqualTypeOf<'render' | 'pages'>();
              expectTypeOf<Exclude<keyof typeof s.sub, symbol>>().toEqualTypeOf<string | number>();
              return [required.strings, required.transition, required.testRunner.runner, s.kids.render];
            },
          });
      })
      .exposes((s) => {
        expectTypeOf<keyof typeof s>().toEqualTypeOf<'sub' | 'kids' | 'logic'>();
        return { logic: s.logic };
      });
  });

  it('refuse a misspelt part', () => {
    const child = archetype('c').contains((p) =>
      p
        .files('logic', '*.ts')
        // @ts-expect-error misspelt part
        .files('a', 'a.ts', { using: (s) => [s.lgoic] }),
    );
    assert.deepEqual(errorsIn(child), ['c.a uses lgoic; a sees logic']);
  });

  it('refuse a part declared further down', () => {
    const child = archetype('c').contains((p) =>
      p
        .files('logic', '*.ts')
        // @ts-expect-error part declared further down
        .files('b', 'b.ts', { using: (s) => [s.later] })
        .files('later', 'later.ts'),
    );
    assert.deepEqual(errorsIn(child), ['c.b uses later; later is declared below b, which sees logic']);
  });

  it('refuse a part that names itself', () => {
    // @ts-expect-error a part is not among the parts above it
    const child = archetype('c').contains((p) => p.files('a', 'a.ts', { using: (s) => [s.a] }));
    assert.deepEqual(errorsIn(child), ['c.a uses a; a part reaches its own files already; a sees no parts']);
  });

  it('refuse a requirement the archetype does not declare', () => {
    const child = archetype('c')
      .requires({ testRunner })
      .contains((p, { required }) =>
        p.files('a', 'a.ts', {
          // @ts-expect-error undeclared requirement
          using: [required.testRunner, required.icons],
        }),
      );
    assert.deepEqual(errorsIn(child), ['c.a uses required.icons; c requires testRunner']);
  });

  it("refuse a misspelt surface of a requirement or a child's archetype", () => {
    const child = archetype('c')
      .requires({ testRunner })
      .contains((p, { required }) =>
        p
          .dir('kids', 'kids/{name}', kid)
          // @ts-expect-error misspelt requirement surface
          .files('c', 'c.ts', { using: [required.testRunner.runer] })
          // @ts-expect-error misspelt child surface
          .files('e', 'e.ts', { using: (s) => [s.kids.rendr] }),
      );
    assert.deepEqual(errorsIn(child), [
      'c.c uses required.testRunner.runer; test-runner exposes contract, runner',
      'c.e uses kids.rendr; kid exposes render, pages',
    ]);
  });

  it('type any self surface, and refuse a misspelt one when the config loads', () => {
    const component = archetype('component')
      .contains((p, { self }) =>
        p
          .dir('subcomponent', '{name}', self)
          .files('logic', '*.ts')
          .files('testPage', '*.test-page.ts')
          .files('dom', '{name}.dom.ts', { using: (s) => [s.logic, s.subcomponent.rendr] }),
      )
      .exposes((s) => ({ render: s.dom, testPage: s.testPage }));
    assert.deepEqual(errorsIn(component), [
      'component.dom uses subcomponent.rendr; component exposes render, testPage',
    ]);
  });

  it('refuse a surface on a part or requirement that has none', () => {
    const child = archetype('c')
      .requires({ strings: dir() })
      .contains((p, { required }) =>
        p
          .files('logic', '*.ts', { using: [required.strings] })
          .dir('folder', 'folder')
          .dir('plain', 'plain/{name}', plainKid)
          // @ts-expect-error a files part has no surfaces
          .files('a', 'a.ts', { using: (s) => [s.logic.render] })
          // @ts-expect-error a plain folder has no surfaces
          .files('b', 'b.ts', { using: (s) => [s.folder.render] })
          // @ts-expect-error an archetype with no .exposes() names no surfaces
          .files('c', 'c.ts', { using: (s) => [s.plain.render] })
          // @ts-expect-error dir() has no surfaces
          .files('d', 'd.ts', { using: [required.strings.render] }),
      );
    assert.deepEqual(errorsIn(child), [
      'c.a uses logic.render; logic is a files part, which has no surfaces',
      'c.b uses folder.render; folder is a plain folder, which has no surfaces',
      'c.c uses plain.render; plain-kid has no .exposes(), so it names no surfaces',
      'c.d uses required.strings.render; required.strings is a plain folder, which has no surfaces',
    ]);
  });

  it('refuse a part declared twice', () => {
    const child = archetype('c').contains((p) =>
      p
        .files('logic', '*.ts')
        // @ts-expect-error duplicate part
        .files('logic', 'x.ts'),
    );
    assert.deepEqual(errorsIn(child), ["c: part 'logic' is already declared"]);
  });

  it('keep s typed in both dir overloads', () => {
    const child = archetype('c').contains((p) =>
      p
        .dir('domain', 'src/domain')
        .dir('ports', 'src/ports', { using: (s) => [s.domain] })
        .dir('kids', 'kids/{name}', kid, { using: (s) => [s.ports] })
        // @ts-expect-error misspelt part in the options overload
        .dir('x', 'x', { using: (s) => [s.domian] })
        // @ts-expect-error misspelt part in the archetype overload
        .dir('y', 'y', kid, { using: (s) => [s.prots] }),
    );
    assert.deepEqual(errorsIn(child), [
      'c.x uses domian; x sees domain, ports, kids',
      'c.y uses prots; y sees domain, ports, kids, x',
    ]);
  });

  it('refuse what exposes and provides cannot name', () => {
    const child = archetype('c')
      .contains((p) => p.files('dom', '*.dom.ts').dir('kids', '{name}', kid))
      // @ts-expect-error a surface names parts, not packages
      .exposes((s) => ({ render: s.dmo, lib: pkg('lit') }))
      .provides((s) => ({ render: s.kids.render }));
    assert.deepEqual(errorsIn(child), [
      'c exposes render as dmo; c has parts dom, kids',
      "c exposes lib as pkg('lit'); exposes and provides name the archetype’s own parts",
      'c provides render as kids.render; name the whole part, without a surface',
    ]);
  });
});
