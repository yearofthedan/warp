import { archetype, defineConfig } from 'warp';
import wt from './rules/noPortsThroughApplication.ts';

const app = archetype('app').contains((p) =>
  p
    .files('domain', 'src/domain/**')
    .files('application', 'src/application/**', { using: (s) => [s.domain] })
    .files('ui', 'src/ui/**', {
      using: (s) => [s.application, s.domain],
      rules: { 'wt/no-ports-through-application': true },
    }),
).exposes(() => ({}));

export default defineConfig({
  root: app,
  plugins: { wt },
  rules: { 'wt/no-ports-through-application': false },
});
