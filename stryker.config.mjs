/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  /* shortcut: Stryker searches for plugins inside its own package, where pnpm does not keep this
     one, so the runner is named here; name it no more once Stryker searches where it is installed. */
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'stryker.vitest.config.ts' },
  /* The unit-tested core: the model, its rules and the reporters, which run on in-memory facts.
     Analysis, config loading, git and the CLI are covered by the integration and e2e tiers, which
     read the disk and spawn processes, too slow to run once per mutant. */
  mutate: ['src/model/**/*.ts', 'src/reporters/**/*.ts', 'src/app/diff.ts', '!src/**/*.test.ts'],
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  /* shortcut: the rules came over with integration tests only, so the unit tier kills 86% of mutants
     overall and nearly all of src/model/archetype; raise break with each slice that adds unit tests, up to 90. */
  thresholds: { high: 90, low: 80, break: 86 },
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
};
