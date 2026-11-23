import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

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

const pkgArchetype = archetype('package')
  .description("warp's source: the model, the rules, the app behind its ports, its adapters and the CLI")
  .contains((m) =>
    m
      .module(
        'model',
        dir('model'),
        exposes(all()).description(
          'The declared model: the archetype builder, config data, resolving files to modules, and reach',
        ),
      )
      .module('rules', dir('rules'), rules)
      .module('builtins', dir('builtins'), builtins)
      .module(
        'app',
        dir('app'),
        exposes(all())
          .description('Loading a config, running the rules on a model, and diffing two commits, behind ports')
          .using((m) => [m.rules, m.model, pkg('node:*')]),
      )
      .module(
        'reporters',
        dir('reporters'),
        exposes(all())
          .description('Formats for findings and the model: text, JSON, SARIF and agent hooks')
          .using((m) => [m.rules, m.model]),
      )
      .module(
        'analysis',
        dir('analysis'),
        exposes(all())
          .description('Reading TypeScript into facts, and the project folders')
          .using((m) => [m.app, m.model, pkg('node:*'), pkg('typescript')]),
      )
      .module(
        'config',
        dir('config'),
        exposes(all())
          .description('Loading a warp.config.ts file')
          .using((m) => [m.model, pkg('node:*')]),
      )
      .module(
        'git',
        dir('git'),
        exposes(all())
          .description('Git: the facts cache and the files at a commit')
          .using((m) => [m.app, pkg('node:*')]),
      )
      .module(
        'cli',
        files('cli.ts'),
        archetype()
          .description('The CLI, which wires adapters, reporters and the built-in rules together')
          .using((m) => [m.analysis, m.config, m.git, m.reporters, m.app, m.rules, m.model, m.builtins, pkg('node:*')]),
      ),
  )
  .entry(files('index.ts'))
  .provides((m) => ({ model: m.model, rules: m.rules, app: m.app }))
  .tests(using((m) => [m.app, m.builtins, m.reporters, m.analysis, m.config]));

const warp = archetype('warp')
  .description('warp: checks a TypeScript codebase against a declared model of its modules')
  .contains((m) =>
    m
      .module('package', dir('src'), pkgArchetype)
      .module(
        'integration',
        dir('integrations'),
        archetype()
          .description('Extensions that run warp from agent harnesses after each edit')
          .using([pkg('node:*')]),
      )
      .module(
        'tooling',
        files('*.ts', 'scripts/*.ts'),
        exposes(all())
          .description("warp's own config and the scripts behind ./do")
          .using((m) => [m.package, pkg('node:*'), pkg('vite-plus'), pkg('typescript')]),
      ),
  )
  .tests(using([pkg('vite-plus/test'), pkg('node:*')]));

const base = ruleset().on(warp.modules.tests, { 'function-cohesion': false });

export default defineConfig({
  root: warp,
  tests: files('**/*.test.ts', 'do.test.ts'),
  rulesets: { default: base },
});
