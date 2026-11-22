import { archetype, defineConfig, ruleset } from 'warp';
import wt from './rules/noPortsThroughApplication.ts';

const app = archetype('app').contains((p) =>
  p
    .files('domain', 'src/domain/**')
    .files('application', 'src/application/**', { using: (s) => [s.domain] })
    .files('ui', 'src/ui/**', { using: (s) => [s.application, s.domain] }),
).exposes(() => ({}));

const base = ruleset()
  .rules({ 'wt/no-ports-through-application': false })
  .on(app.ui, { 'wt/no-ports-through-application': true });

export default defineConfig({ root: app, plugins: { wt }, rulesets: { default: base } });
