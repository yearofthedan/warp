import { all, archetype, defineConfig, dir, exposes, files, pkg, using } from 'warp';

const layer = archetype('layer')
  .contains((m) =>
    m
      .module('src', files('**'), exposes(all()))
      .module('index', files('index.ts'), exposes(all()).using((s) => [s.src]))
      .module('test', files('**/*.test.ts'), using((s) => [s.src, pkg('node:*')])),
  )
  .exposes((s) => ({ api: s.index }));

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ strings: dir() })
  .contains((m, { required, self }) =>
    m
      .module('subcomponent', dir('{name}'), self)
      .module('logic', files('*.ts'), exposes(all()))
      .module('dom', files('{name}.dom.ts'), exposes(all()).using((s) => [s.logic, s.subcomponent.render, required.strings])),
  )
  .exposes((s) => ({ render: s.dom }));

const ui = archetype('ui')
  .contains((m) =>
    m.module('strings', dir('strings'), exposes(all())).module('components', dir('{name}'), component),
  )
  .provides((s) => ({ strings: s.strings }))
  .exposes(all());

const app = archetype('app').contains((m) =>
  m
    .module('domain', dir('src/domain'), layer)
    .module('ui', dir('src/ui'), ui.using((s) => [s.domain]))
    .module('main', files('src/main.ts'), using((s) => [s.domain, s.ui])),
);

export default defineConfig({ root: app, tsconfig: ['tsconfig.json', 'tsconfig.test.json'] });
