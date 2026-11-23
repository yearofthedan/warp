import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from 'warp';

const rules = archetype('rules')
  .description('The rules API: what a rule implements, how rules are registered, and how findings compare')
  .requires({ model: dir() })
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
          .using((m) => [m.rule, required.model]),
      )
      .module(
        'findings',
        files('diff.ts'),
        exposes(all())
          .description('Comparing two sets of findings')
          .using((m) => [m.rule]),
      ),
  )
  .exposes((m) => ({ rule: m.rule, registry: m.registry, findings: m.findings }));

const builtins = archetype('builtins')
  .description("warp's own rules: one folder per rule, holding its rule, its tests and its page")
  .requires({ model: dir(), rules, app: dir() })
  .contains((m, { required }) =>
    m.module(
      'code',
      files('**'),
      exposes(all())
        .description('Each rule, the list of built-ins with their docs links, and the helpers rules share')
        .using([required.rules, required.model]),
    ),
  )
  .exposes(all())
  .tests(using((m, { required }) => [required.app]));

const warp = archetype('warp')
  .description('warp: checks a TypeScript codebase against a declared model of its modules')
  .contains((m) =>
    m
      .module(
        'model',
        dir('src/model'),
        exposes(all()).description(
          'The declared model: the archetype builder, config data, resolving files to modules, and reach',
        ),
      )
      .module('rules', dir('src/rules'), rules)
      .module('builtins', dir('src/builtins'), builtins)
      .module(
        'app',
        dir('src/app'),
        exposes(all())
          .description('Loading a config, running the rules on a model, and diffing two commits, behind ports')
          .using((m) => [m.rules, m.model, pkg('node:*')]),
      )
      .module(
        'reporters',
        dir('src/reporters'),
        exposes(all())
          .description('Formats for findings and the model: text, JSON, SARIF and agent hooks')
          .using((m) => [m.rules, m.model]),
      )
      .module(
        'analysis',
        dir('src/analysis'),
        exposes(all())
          .description('Reading TypeScript into facts, and the project folders')
          .using((m) => [m.app, m.model, pkg('node:*'), pkg('typescript')]),
      )
      .module(
        'config',
        dir('src/config'),
        exposes(all())
          .description('Loading a warp.config.ts file')
          .using((m) => [m.app, m.model, pkg('node:*'), pkg('typescript')]),
      )
      .module(
        'git',
        dir('src/git'),
        exposes(all())
          .description('Git: the facts cache and the files at a commit')
          .using((m) => [m.app, m.model, pkg('node:*')]),
      )
      .module(
        'entry',
        files('src/cli.ts'),
        exposes(all())
          .description('The CLI, which wires adapters, reporters and the built-in rules together')
          .using((m) => [m.analysis, m.config, m.git, m.reporters, m.app, m.rules, m.model, m.builtins, pkg('node:*')]),
      )
      .module(
        'api',
        files('src/index.ts'),
        exposes(all())
          .description("The package's public API, imported by warp.config.ts files and plugins")
          .using((m) => [m.app, m.rules, m.model]),
      )
      .module(
        'integration',
        dir('integrations'),
        exposes(all())
          .description('Extensions that run warp from agent harnesses after each edit')
          .using([pkg('node:*')]),
      )
      .module(
        'tooling',
        files('*.ts', 'scripts/*.ts'),
        exposes(all())
          .description("warp's own config and the scripts behind ./do")
          .using((m) => [m.api, pkg('node:*'), pkg('vite-plus'), pkg('typescript')]),
      ),
  )
  .provides((m) => ({ model: m.model, rules: m.rules, app: m.app }))
  .exposes((m) => ({ api: m.api }))
  .tests(using((m) => [m.app, m.builtins, m.reporters, m.analysis, m.config, pkg('vite-plus/test'), pkg('node:*')]));

const base = ruleset()
  .on(warp.modules.tests, { 'function-cohesion': false })
  // why: src/index.ts is the package's facade over app, rules and model, which are now modules of their own.
  // until: no-cross-module-reexport allows a facade its parent exposes (modules.md, open question 2)
  .on(warp.modules.api, { 'no-cross-module-reexport': false });

export default defineConfig({
  root: warp,
  tests: files('**/*.test.ts', 'do.test.ts'),
  rulesets: { default: base },
});
