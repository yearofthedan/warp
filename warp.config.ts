import { archetype, defineConfig, files, pkg, ruleset } from 'warp';

const testing = [pkg('vite-plus/test'), pkg('node:*')];

const rules = archetype('rules')
  .description('The built-in rules: one folder per rule, holding its module, its tests and its page')
  .requires({ model: files(), rule: files(), app: files() })
  .contains((p, { required }) =>
    p
      .files('code', '**', {
        description: 'Each rule module, the list of built-ins, and the helpers rules share',
        using: [required.rule, required.model],
      })
      .files('test', '**/*.test.ts', {
        description: 'Rule tests, run through the model check',
        using: (s) => [s.code, required.app, required.rule, required.model, ...testing],
      }),
  );

const warp = archetype('warp')
  .description('warp: checks a TypeScript codebase against a declared model of its modules')
  .contains((p) =>
    p
      .files('model', 'src/model/**', {
        description:
          'The declared model: the archetype builder, config data, resolving files to units and parts, and reach',
      })
      .files('rule', 'src/rule/**', {
        description: 'The contract a rule implements, the registry of rules, and diffing findings',
        using: (s) => [s.model],
      })
      .dir('rules', 'src/rules', rules)
      .files('app', 'src/app/**', {
        description: 'Loading a config, running the rules on a model, and diffing two commits, behind ports',
        using: (s) => [s.rule, s.model, pkg('node:*')],
      })
      .files('reporters', 'src/reporters/**', {
        description: 'Formats for findings and the model: text, JSON, SARIF and agent hooks',
        using: (s) => [s.rule, s.model],
      })
      .files('adapters', ['src/analysis/**', 'src/config/**', 'src/git/**'], {
        description: 'The ports on disk: TypeScript analysis, config files and git',
        using: (s) => [s.app, s.rule, s.model, pkg('node:*'), pkg('typescript')],
      })
      .files('entry', ['src/cli.ts', 'src/builtins.ts'], {
        description: 'The CLI, which wires adapters, reporters and the built-in rules together',
        using: (s) => [s.adapters, s.reporters, s.app, s.rule, s.model, s.rules, pkg('node:*')],
      })
      .files('api', 'src/index.ts', {
        description: "The package's public API, imported by warp.config.ts files and plugins",
        using: (s) => [s.app, s.rule, s.model],
      })
      .files('integration', 'integrations/**', {
        description: 'Extensions that run warp from agent harnesses after each edit',
        using: [pkg('node:*')],
      })
      .files('tooling', ['*.ts', 'scripts/*.ts'], {
        description: "warp's own config and the scripts behind ./do",
        using: (s) => [s.api, pkg('node:*'), pkg('vite-plus'), pkg('typescript')],
      })
      .files('unitTest', ['src/**/*.test.ts', 'integrations/**/*.test.ts', 'scripts/*.test.ts'], {
        description: 'Unit tests: in memory, on facts built by hand',
        using: (s) => [s.entry, s.app, s.reporters, s.rule, s.model, s.rules, s.integration, s.tooling, ...testing],
      })
      .files('integrationTest', 'src/**/*.integration.test.ts', {
        description: 'Integration tests: analysis and config loading against the repos in fixtures/',
        using: (s) => [s.adapters, s.entry, s.app, s.reporters, s.rule, s.model, s.rules, ...testing],
      })
      .files('e2e', ['e2e/**', 'do.test.ts'], {
        description: 'End-to-end tests that spawn the CLI and ./do',
        using: testing,
      }),
  )
  .provides((s) => ({ model: s.model, rule: s.rule, app: s.app }))
  .exposes((s) => ({ api: s.api }));

const testsRunLong = { 'function-cohesion': false };

const base = ruleset()
  .on(rules.test, testsRunLong)
  .on(warp.unitTest, testsRunLong)
  .on(warp.integrationTest, testsRunLong)
  .on(warp.e2e, testsRunLong);

export default defineConfig({ root: warp, rulesets: { default: base } });
