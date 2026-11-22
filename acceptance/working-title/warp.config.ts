import { archetype, defineConfig, dir, files, mustImport, pkg } from 'warp';

const testRunner = archetype('test-runner')
  .contains((p) =>
    p
      .files('contract', ['driver.ts', 'steps.ts', 'seed.ts', 'narrowing.ts', 'scenario-file.ts', 'ids.ts'])
      .files('runner', '**', { using: (s) => [s.contract] }),
  )
  .exposes((s) => ({ contract: s.contract, runner: s.runner }));

const layer = archetype('layer')
  .description('A folder of code whose tests need the runner: domain, application, adapters, lint')
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

export default defineConfig({ root: workingTitle });
