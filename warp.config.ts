import { archetype, defineConfig, files, pkg, ruleset } from 'warp';

const testing = [pkg('vite-plus/test'), pkg('node:*')];

const rules = archetype('rules')
  .description('The built-in rules: one folder per rule, holding its module, its tests and its page')
  .requires({ model: files() })
  .contains((p, { required }) =>
    p
      .files('code', '**', { using: [required.model, pkg('node:*')] })
      .files('test', '**/*.test.ts', { using: (s) => [s.code, required.model, ...testing] }),
  );

const warp = archetype('warp')
  .contains((p) =>
    p
      .files('model', 'src/model/**', { using: [pkg('node:*')] })
      .dir('rules', 'src/model/rules', rules)
      .files('app', 'src/app/**', { using: (s) => [s.model, pkg('node:*')] })
      .files('reporters', 'src/reporters/**', { using: (s) => [s.model, pkg('node:*')] })
      .files('adapters', ['src/analysis/**', 'src/config/**', 'src/git/**'], {
        using: (s) => [s.app, s.model, pkg('node:*'), pkg('typescript')],
      })
      .files('entry', ['src/cli.ts', 'src/builtins.ts'], {
        using: (s) => [s.adapters, s.reporters, s.app, s.model, s.rules, pkg('node:*')],
      })
      .files('api', 'src/index.ts', { using: (s) => [s.model] })
      .files('integration', 'integrations/**', { using: [pkg('node:*')] })
      .files('tooling', ['*.ts', 'scripts/*.ts'], {
        using: (s) => [s.api, pkg('node:*'), pkg('vite-plus'), pkg('typescript')],
      })
      .files('unitTest', ['src/**/*.test.ts', 'integrations/**/*.test.ts', 'scripts/*.test.ts'], {
        using: (s) => [s.entry, s.app, s.reporters, s.model, s.rules, s.integration, s.tooling, ...testing],
      })
      .files('integrationTest', 'src/**/*.integration.test.ts', {
        using: (s) => [s.adapters, s.entry, s.app, s.reporters, s.model, s.rules, ...testing],
      })
      .files('e2e', ['e2e/**', 'do.test.ts'], { using: testing }),
  )
  .provides((s) => ({ model: s.model }))
  .exposes((s) => ({ api: s.api }));

const testsRunLong = { 'function-cohesion': false };

const base = ruleset()
  .on(rules.test, testsRunLong)
  .on(warp.unitTest, testsRunLong)
  .on(warp.integrationTest, testsRunLong)
  .on(warp.e2e, testsRunLong);

export default defineConfig({ root: warp, rulesets: { default: base } });
