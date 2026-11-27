export default {
  // why: Stryker looks for plugins inside its own package, where pnpm keeps none.
  // until: Stryker resolves plugins from the project that installs it
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'stryker.vitest.config.ts' },
  mutate: [
    'src/domain/**/*.ts',
    'src/builtins/**/*.ts',
    'src/adapters/reporters/**/*.ts',
    'src/app/{checkModel,diff,facts,load}.ts',
    '!src/**/*.test.ts',
  ],
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  // why: the rules came over with integration tests only; raise break as slices add unit tests.
  // until: break reaches 90, the high mark
  thresholds: { high: 90, low: 80, break: 89 },
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
};
