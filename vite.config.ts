import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vite-plus';

const unit = ['src/**/*.test.ts', 'scripts/*.test.ts'];
const integration = ['src/**/*.integration.test.ts'];
const e2e = ['e2e/**/*.test.ts', 'do.test.ts'];

export default defineConfig({
  fmt: {
    ignorePatterns: ['**/*.md', 'fixtures/**'],
    singleQuote: true,
    printWidth: 120,
  },
  lint: {
    ignorePatterns: ['fixtures/**'],
    // why: type-aware linting runs on the TypeScript Vite+ bundles, older than the 7.1 warp builds with.
    // until: vite-plus bundles typescript@7.1
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
      {
        resolve: { alias: { '@yearofthedan/warp': fileURLToPath(new URL('src/index.ts', import.meta.url)) } },
        test: { name: 'integration', environment: 'node', include: integration },
      },
      { test: { name: 'e2e', environment: 'node', include: e2e, testTimeout: 60_000 } },
    ],
  },
  staged: {
    '*': 'vp check --fix',
  },
});
