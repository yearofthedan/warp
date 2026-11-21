import { configDefaults, defineConfig } from 'vite-plus';

// The three tiers, by file name (docs/adr/0001-toolchain.md):
// unit runs in memory, integration reads fixtures/, e2e spawns the CLI.
const unit = ['src/**/*.test.ts', 'integrations/**/*.test.ts'];
const integration = ['src/**/*.integration.test.ts'];
// do.test.ts runs each ./do script's shell suite against a stubbed copy of the repo.
const e2e = ['e2e/**/*.test.ts', 'do.test.ts'];

export default defineConfig({
  fmt: {
    ignorePatterns: ['**/*.md', 'fixtures/**'],
    singleQuote: true,
    printWidth: 120,
  },
  lint: {
    ignorePatterns: ['fixtures/**'],
    // shortcut: type-aware linting runs on the TypeScript Vite+ bundles, not the pinned 7.1 that warp builds with,
    // so `./do check` type-checks with the pinned tsc instead; turn these on once Vite+ ships 7.1.
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: unit,
          exclude: [...configDefaults.exclude, ...integration],
        },
      },
      { test: { name: 'integration', environment: 'node', include: integration } },
      { test: { name: 'e2e', environment: 'node', include: e2e, testTimeout: 60_000 } },
    ],
  },
  staged: {
    '*': 'vp check --fix',
  },
});
