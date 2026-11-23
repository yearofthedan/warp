import { all, archetype, defineConfig, dir, exposes, files, pkg, using } from 'warp';

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
        exposes(all()).using((s) => [s.contract]),
      ),
  )
  .exposes((s) => ({ contract: s.contract, runner: s.runner }));

const layer = archetype('layer')
  .description('A folder of code whose tests need the runner: domain, application, adapters, lint')
  .requires({ testRunner, methods: dir() })
  .contains((m, { required }) =>
    m.module('src', files('**'), exposes(all())).module(
      'test',
      files('**/*.test.ts'),
      using((s) => [
        s.src,
        required.testRunner.runner,
        required.testRunner.contract,
        required.methods,
        pkg('vite-plus/*'),
      ]),
    ),
  )
  .exposes((s) => ({ code: s.src }));

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
        exposes(all()).using((s) => [
          s.logic,
          s.subcomponent.render,
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
        exposes(all()).using((s) => [s.subcomponent.dsl, required.testRunner.contract]),
      )
      .module(
        'testPage',
        files('*.test-page.ts'),
        exposes(all()).using((s) => [s.subcomponent.testPage, pkg('vite-plus/*')]),
      )
      .module(
        'harness',
        files('*.harness.ts'),
        exposes(all()).using((s) => [
          s.dom,
          s.logic,
          s.dsl,
          s.testPage,
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
        using((s) => [
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
        ]),
      ),
  )
  .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }));

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
        using((s) => [s.transition, pkg('vite-plus/*')]),
      ),
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
  .contains((m, { required }) =>
    m.module('dsl', files('*.dsl.ts'), exposes(all()).using([required.testRunner.contract, required.ui.dsl])).module(
      'rest',
      files('**'),
      using((s) => [s.dsl, required.testRunner.runner, required.testRunner.contract, required.ui.dsl]),
    ),
  );

const workingTitle = archetype('working-title')
  .contains((m) =>
    m
      .module('domain', dir('src/domain'), layer)
      .module(
        'ports',
        dir('src/ports'),
        exposes(all()).using((s) => [s.domain]),
      )
      .module(
        'methods',
        dir('src/methods'),
        exposes(all()).using((s) => [s.domain]),
      )
      .module(
        'application',
        dir('src/application'),
        layer.using((s) => [s.domain, s.ports]),
      )
      .module(
        'adapters',
        dir('src/adapters'),
        layer.using((s) => [s.domain, s.ports, pkg('*')]),
      )
      .module(
        'ui',
        dir('src/ui'),
        ui.using((s) => [s.application]),
      )
      .module('styles', files('src/*.css'), exposes(all()))
      .module(
        'shell',
        files('src/shell.ts'),
        exposes(all()).using((s) => [s.application, s.ui.strings]),
      )
      .module(
        'app',
        files('src/main.ts', 'src/app.ts'),
        exposes(all()).using((s) => [
          s.application,
          s.adapters,
          s.ports,
          s.methods,
          s.ui.render,
          s.ui.strings,
          s.shell,
          s.styles,
          pkg('virtual:*'),
        ]),
      )
      .module(
        'testRunner',
        dir('src/test-helpers'),
        testRunner.using((s) => [
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
        ]),
      )
      .module(
        'e2e',
        dir('e2e'),
        journeys.using((s) => [s.adapters, s.ui.testPage, pkg('*')]),
      )
      .module('lint', dir('lint'), layer.using([pkg('*')]))
      .module(
        'tooling',
        files('*.ts', 'scripts/**/*.ts'),
        using((s) => [s.lint, pkg('*')]),
      ),
  )
  .provides((s) => ({
    testRunner: s.testRunner,
    application: s.application,
    ports: s.ports,
    methods: s.methods,
    ui: s.ui,
  }));

export default defineConfig({ root: workingTitle });
