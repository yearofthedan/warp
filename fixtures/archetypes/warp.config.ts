import { archetype, defineConfig } from 'warp';

const layer = archetype('layer').contains((p) =>
  p.files('src', '**').files('test', '**/*.test.ts', { using: (s) => [s.src] }),
);

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .contains((p, { self }) =>
    p
      .dir('subcomponent', '{name}', self)
      .files('logic', '*.ts')
      .files('dom', '{name}.dom.ts', { using: (s) => [s.logic, s.subcomponent.render] }),
  )
  .exposes((s) => ({ render: s.dom }));

const ui = archetype('ui').contains((p) => p.dir('strings', 'strings').dir('components', '{name}', component));

const app = archetype('app').contains((p) =>
  p
    .dir('domain', 'src/domain', layer)
    .dir('ui', 'src/ui', ui, { using: (s) => [s.domain] })
    .files('main', 'src/main.ts', { using: (s) => [s.ui] }),
);

export default defineConfig({ root: app, tsconfig: ['tsconfig.json', 'tsconfig.test.json'] });
