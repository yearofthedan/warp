import { all, archetype, defineConfig, exposes, files, ruleset, using } from '@yearofthedan/warp';
import wt from './rules/noPortsThroughApplication.ts';

const app = archetype('app').contains((m) =>
  m
    .module('domain', files('src/domain/**'), exposes(all()))
    .module('application', files('src/application/**'), exposes(files('src/application/index.ts')).using((m) => [m.domain]))
    .module('ui', files('src/ui/**'), using((m) => [m.application])),
);

const base = ruleset()
  .rules({ 'wt/no-ports-through-application': false })
  .on(app.modules.ui, { 'wt/no-ports-through-application': true });

export default defineConfig({ root: app, plugins: { wt }, rulesets: { default: base } });
