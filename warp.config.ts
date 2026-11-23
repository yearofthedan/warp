import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset } from 'warp';

const testing = [pkg('vite-plus/test'), pkg('node:*')];

const rules = archetype('rules')
  .description('The rules API: what a rule implements, how rules are registered, and how findings compare')
  .requires({ model: files() })
  .contains((m, { required }) =>
    m
      .module(
        'rule',
        files('rule.ts'),
        exposes(all())
          .description('The contract a rule implements and the findings it returns')
          .using([required.model]),
      )
      .module(
        'registry',
        files('registry.ts'),
        exposes(all())
          .description('Rules by id, with plugin rules namespaced')
          .using((s) => [s.rule, required.model]),
      )
      .module(
        'findings',
        files('diff.ts'),
        exposes(all())
          .description('Comparing two sets of findings')
          .using((s) => [s.rule]),
      )
      .module(
        'test',
        files('*.test.ts'),
        archetype()
          .description('Unit tests for the registry and findings')
          .using((s) => [s.registry, s.findings, s.rule, required.model, ...testing]),
      ),
  )
  .exposes((s) => ({ rule: s.rule, registry: s.registry, findings: s.findings }));

const builtins = archetype('builtins')
  .description("warp's own rules: one folder per rule, holding its rule, its tests and its page")
  .requires({ model: files(), rules, app: files() })
  .contains((m, { required }) =>
    m
      .module(
        'code',
        files('**'),
        exposes(all())
          .description('Each rule, the list of built-ins with their docs links, and the helpers rules share')
          .using([required.rules, required.model]),
      )
      .module(
        'test',
        files('**/*.test.ts'),
        archetype()
          .description('Rule tests, run through the model check')
          .using((s) => [s.code, required.app, required.rules, required.model, ...testing]),
      ),
  )
  .exposes(all());

const warp = archetype('warp')
  .description('warp: checks a TypeScript codebase against a declared model of its modules')
  .contains((m) =>
    m
      .module(
        'model',
        files('src/model/**'),
        exposes(all()).description(
          'The declared model: the archetype builder, config data, resolving files to modules, and reach',
        ),
      )
      .module('rules', dir('src/rules'), rules)
      .module('builtins', dir('src/builtins'), builtins)
      .module(
        'app',
        files('src/app/**'),
        exposes(all())
          .description('Loading a config, running the rules on a model, and diffing two commits, behind ports')
          .using((s) => [s.rules, s.model, pkg('node:*')]),
      )
      .module(
        'reporters',
        files('src/reporters/**'),
        exposes(all())
          .description('Formats for findings and the model: text, JSON, SARIF and agent hooks')
          .using((s) => [s.rules, s.model]),
      )
      .module(
        'adapters',
        files('src/analysis/**', 'src/config/**', 'src/git/**'),
        exposes(all())
          .description('The ports on disk: TypeScript analysis, config files and git')
          .using((s) => [s.app, s.rules, s.model, pkg('node:*'), pkg('typescript')]),
      )
      .module(
        'entry',
        files('src/cli.ts'),
        exposes(all())
          .description('The CLI, which wires adapters, reporters and the built-in rules together')
          .using((s) => [s.adapters, s.reporters, s.app, s.rules, s.model, s.builtins, pkg('node:*')]),
      )
      .module(
        'api',
        files('src/index.ts'),
        exposes(all())
          .description("The package's public API, imported by warp.config.ts files and plugins")
          .using((s) => [s.app, s.rules, s.model]),
      )
      .module(
        'integration',
        files('integrations/**'),
        exposes(all())
          .description('Extensions that run warp from agent harnesses after each edit')
          .using([pkg('node:*')]),
      )
      .module(
        'tooling',
        files('*.ts', 'scripts/*.ts'),
        exposes(all())
          .description("warp's own config and the scripts behind ./do")
          .using((s) => [s.api, pkg('node:*'), pkg('vite-plus'), pkg('typescript')]),
      )
      .module(
        'unitTest',
        files('src/**/*.test.ts', 'integrations/**/*.test.ts', 'scripts/*.test.ts'),
        archetype()
          .description('Unit tests: in memory, on facts built by hand')
          .using((s) => [
            s.entry,
            s.app,
            s.reporters,
            s.rules,
            s.model,
            s.builtins,
            s.integration,
            s.tooling,
            ...testing,
          ]),
      )
      .module(
        'integrationTest',
        files('src/**/*.integration.test.ts'),
        archetype()
          .description('Integration tests: analysis and config loading against the repos in fixtures/')
          .using((s) => [s.adapters, s.entry, s.app, s.reporters, s.rules, s.model, s.builtins, ...testing]),
      )
      .module(
        'e2e',
        files('e2e/**', 'do.test.ts'),
        archetype().description('End-to-end tests that spawn the CLI and ./do').using(testing),
      ),
  )
  .provides((s) => ({ model: s.model, rules: s.rules, app: s.app }))
  .exposes((s) => ({ api: s.api }));

const testsRunLong = { 'function-cohesion': false };

const base = ruleset()
  .on(builtins.modules.test, testsRunLong)
  .on(rules.modules.test, testsRunLong)
  .on(warp.modules.unitTest, testsRunLong)
  .on(warp.modules.integrationTest, testsRunLong)
  .on(warp.modules.e2e, testsRunLong)
  // why: src/index.ts is the package's facade over app, rules and model, which are now modules of their own.
  // until: no-cross-module-reexport allows a facade its parent exposes (modules.md, open question 2)
  .on(warp.modules.api, { 'no-cross-module-reexport': false });

export default defineConfig({ root: warp, rulesets: { default: base } });
