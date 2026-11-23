import { archetype, defineConfig, files, pkg, ruleset } from 'warp';

const testing = [pkg('vite-plus/test'), pkg('node:*')];

const rules = archetype('rules')
  .description('The rules API: what a rule implements, how rules are registered, and how findings compare')
  .requires({ model: files() })
  .contains((p, { required }) =>
    p
      .files('rule', 'rule.ts', {
        description: 'The contract a rule implements and the findings it returns',
        using: [required.model],
      })
      .files('registry', 'registry.ts', {
        description: 'Rules by id, with plugin rules namespaced',
        using: (s) => [s.rule, required.model],
      })
      .files('findings', 'diff.ts', {
        description: 'Comparing two sets of findings',
        using: (s) => [s.rule],
      })
      .files('test', '*.test.ts', {
        description: 'Unit tests for the registry and findings',
        using: (s) => [s.registry, s.findings, s.rule, required.model, ...testing],
      }),
  )
  .exposes((s) => ({ rule: s.rule, registry: s.registry, findings: s.findings }));

const builtins = archetype('builtins')
  .description("warp's own rules: one folder per rule, holding its rule, its tests and its page")
  .requires({ model: files(), rules, app: files() })
  .contains((p, { required }) =>
    p
      .files('code', '**', {
        description: 'Each rule, the list of built-ins with their docs links, and the helpers rules share',
        using: [required.rules, required.model],
      })
      .files('test', '**/*.test.ts', {
        description: 'Rule tests, run through the model check',
        using: (s) => [s.code, required.app, required.rules, required.model, ...testing],
      }),
  );

const warp = archetype('warp')
  .description('warp: checks a TypeScript codebase against a declared model of its modules')
  .contains((p) =>
    p
      .files('model', 'src/model/**', {
        description:
          'The declared model: the archetype builder, config data, resolving files to modules and parts, and reach',
      })
      .dir('rules', 'src/rules', rules)
      .dir('builtins', 'src/builtins', builtins)
      .files('app', 'src/app/**', {
        description: 'Loading a config, running the rules on a model, and diffing two commits, behind ports',
        using: (s) => [s.rules, s.model, pkg('node:*')],
      })
      .files('reporters', 'src/reporters/**', {
        description: 'Formats for findings and the model: text, JSON, SARIF and agent hooks',
        using: (s) => [s.rules, s.model],
      })
      .files('adapters', ['src/analysis/**', 'src/config/**', 'src/git/**'], {
        description: 'The ports on disk: TypeScript analysis, config files and git',
        using: (s) => [s.app, s.rules, s.model, pkg('node:*'), pkg('typescript')],
      })
      .files('entry', 'src/cli.ts', {
        description: 'The CLI, which wires adapters, reporters and the built-in rules together',
        using: (s) => [s.adapters, s.reporters, s.app, s.rules, s.model, s.builtins, pkg('node:*')],
      })
      .files('api', 'src/index.ts', {
        description: "The package's public API, imported by warp.config.ts files and plugins",
        using: (s) => [s.app, s.rules, s.model],
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
        using: (s) => [s.entry, s.app, s.reporters, s.rules, s.model, s.builtins, s.integration, s.tooling, ...testing],
      })
      .files('integrationTest', 'src/**/*.integration.test.ts', {
        description: 'Integration tests: analysis and config loading against the repos in fixtures/',
        using: (s) => [s.adapters, s.entry, s.app, s.reporters, s.rules, s.model, s.builtins, ...testing],
      })
      .files('e2e', ['e2e/**', 'do.test.ts'], {
        description: 'End-to-end tests that spawn the CLI and ./do',
        using: testing,
      }),
  )
  .provides((s) => ({ model: s.model, rules: s.rules, app: s.app }))
  .exposes((s) => ({ api: s.api }));

const testsRunLong = { 'function-cohesion': false };

const base = ruleset()
  .on(builtins.test, testsRunLong)
  .on(rules.test, testsRunLong)
  .on(warp.unitTest, testsRunLong)
  .on(warp.integrationTest, testsRunLong)
  .on(warp.e2e, testsRunLong);

export default defineConfig({ root: warp, rulesets: { default: base } });
