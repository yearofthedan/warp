import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

const rules = archetype('rules')
  .description('The rules API: what a rule implements, how rules are registered, and how findings compare')
  .requires({ model: dir() })
  .contains((c, { required }) =>
    c
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
  .contains((c, { required }) =>
    c
      .module(
        'code',
        files('**'),
        exposes(all())
          .description('Each rule, the list of built-ins with their docs links, and the helpers rules share')
          .using([required.rules, required.model]),
      )
      .testModule('tests', files('**/*.test.ts'), using([required.app])),
  )
  .exposes(all());

const pkgArchetype = archetype('package')
  .description("warp's source: the model, the rules, the app behind its ports, its adapters and the CLI")
  .contains((c) =>
    c
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
      )
      .testModule('tests', files('**/*.test.ts')),
  )
  .entry(files('index.ts'))
  .provides((m) => ({ model: m.model, rules: m.rules, app: m.app }));

const warp = archetype('warp')
  .description('warp: checks a TypeScript codebase against a declared model of its modules')
  .contains((c) =>
    c
      .module('package', dir('src'), pkgArchetype)
      .module(
        'tooling',
        files('*.ts', 'scripts/*.ts'),
        exposes(all())
          .description('The scripts behind ./do and the tool configs')
          .using([pkg('node:*'), pkg('vite-plus'), pkg('typescript')]),
      )
      .testModule('tests', files('*.test.ts', 'scripts/*.test.ts', 'e2e/*.test.ts')),
  )
  .testUsing([pkg('vite-plus/test'), pkg('node:*')]);

const testsOff = { 'function-cohesion': false };
const base = ruleset()
  .on(warp.modules.tests, testsOff)
  .on(pkgArchetype.modules.tests, testsOff)
  .on(builtins.modules.tests, testsOff);

export default defineConfig({
  root: warp,
  rulesets: { default: base },
});
