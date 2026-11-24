import { all, archetype, defineConfig, dir, exposes, files, pkg, using } from '@yearofthedan/warp';

const layer = archetype('layer')
  .contains((m) =>
    m
      .module('src', files('**'), exposes(all()))
      .module('index', files('index.ts'), exposes(all()).using((m) => [m.src]))
      .testModule('tests', files('**/*.test.ts')),
  )
  .exposes((m) => ({ api: m.index }));

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ strings: dir() })
  .contains((m, { required, self }) =>
    m
      .module('subcomponent', dir('{name}'), self)
      .module('logic', files('*.ts'), exposes(all()))
      .module('dom', files('{name}.dom.ts'), exposes(all()).using((m) => [m.logic, m.subcomponent.render, required.strings])),
  )
  .exposes((m) => ({ render: m.dom }));

const ui = archetype('ui')
  .contains((m) =>
    m.module('strings', dir('strings'), exposes(all())).module('components', dir('{name}'), component),
  )
  .provides((m) => ({ strings: m.strings }))
  .exposes(all());

const app = archetype('app')
  .contains((m) =>
    m
      .module('domain', dir('src/domain'), layer)
      .module('ui', dir('src/ui'), ui.using((m) => [m.domain]))
      .module('main', files('src/main.ts'), using((m) => [m.domain, m.ui])),
  )
  .testUsing([pkg('node:*')]);

export default defineConfig({
  root: app,
  tsconfig: ['tsconfig.json', 'tsconfig.test.json'],
  tests: files('**/*.test.ts'),
});
