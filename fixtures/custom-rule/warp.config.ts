import { all, archetype, defineConfig, exposes, files, ruleset, using } from 'warp';
import wt from './rules/noPortsThroughApplication.ts';

const app = archetype('app').contains((m) =>
  m
    .module('domain', files('src/domain/**'), exposes(all()))
    .module('application', files('src/application/**'), exposes(files('src/application/index.ts')).using((s) => [s.domain]))
    .module('ui', files('src/ui/**'), using((s) => [s.application, s.domain])),
);

const base = ruleset()
  .rules({ 'wt/no-ports-through-application': false })
  .on(app.modules.ui, { 'wt/no-ports-through-application': true });

export default defineConfig({ root: app, plugins: { wt }, rulesets: { default: base } });
