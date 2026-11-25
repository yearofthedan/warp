import { all, archetype, defineConfig, dir, exposes, files, pkg, using } from '@yearofthedan/warp';

const layer = archetype('layer')
  .description('A folder of code whose tests need the runner: domain, application, adapters, lint')
  .requires({ methods: dir() })
  .contains((m) => m.module('src', files('**'), exposes(all())).testModule('tests', files('**/*.test.ts')))
  .exposes((m) => ({ code: m.src }))
  .testUsing((m, { required }) => [required.methods]);

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ application: layer, ports: dir(), strings: dir(), icons: dir(), transition: files() })
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
      .testModule('dsl', files('*.dsl.ts'))
      .testModule('testPage', files('*.test-page.ts'))
      .testModule('harness', files('*.harness.ts'))
      .testModule('tests', files('*.test.ts')),
  )
  .exposes((m) => ({ render: m.dom }))
  .testExposes((m) => ({ dsl: m.dsl, testPage: m.testPage }))
  .testUsing((m, { required }) => [m.dsl, m.testPage, m.harness, required.ports, pkg('@playwright/*')]);

const ui = archetype('ui')
  .contains((m) =>
    m
      .module('components', dir('{name}'), component)
      .module('strings', dir('strings'), exposes(all()).description("The app's words"))
      .module('icons', dir('icons'), exposes(all()))
      .module('transition', files('transition.ts'), exposes(all()))
      .testModule('tests', files('*.test.ts')),
  )
  .provides((m) => ({ strings: m.strings, icons: m.icons, transition: m.transition }))
  .exposes((m) => ({ render: m.components.render, strings: m.strings }))
  .testExposes((m) => ({ dsl: m.components.dsl, testPage: m.components.testPage }));

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
      .module('lint', dir('lint'), layer.using([pkg('*')]))
      .module(
        'tooling',
        files('*.ts', 'scripts/**/*.ts'),
        using((m) => [m.lint, pkg('*')]),
      )
      .testModule(
        'contract',
        files(
          'src/test-helpers/driver.ts',
          'src/test-helpers/steps.ts',
          'src/test-helpers/seed.ts',
          'src/test-helpers/narrowing.ts',
          'src/test-helpers/scenario-file.ts',
          'src/test-helpers/ids.ts',
        ),
      )
      .testModule('runner', dir('src/test-helpers'))
      .testModule('journeys', files('e2e/*.dsl.ts'))
      .testModule('e2e', dir('e2e'))
      .testModule('tests', files('*.test.ts', 'scripts/**/*.test.ts')),
  )
  .provides((m) => ({
    application: m.application,
    ports: m.ports,
    methods: m.methods,
  }))
  .testUsing((m) => [
    m.domain,
    m.application,
    m.adapters,
    m.methods,
    m.app,
    m.shell,
    m.ports,
    m.contract,
    m.runner,
    m.journeys,
    pkg('vite-plus/*'),
    pkg('*'),
  ]);

export default defineConfig({ root: workingTitle });
