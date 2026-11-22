# Toolchain

**Audience:** anyone changing warp's tasks, CI or dependency settings.
**Purpose:** why each setting in the tool configs is there, so a config file holds settings and this page holds reasons.

## Dependencies

`pnpm-workspace.yaml` holds the supply-chain settings:

- `minimumReleaseAge: 4320` waits three days, the span Renovate waits, so a release withdrawn as compromised never
  reaches a machine ([pnpm](https://pnpm.io/settings/dependency-resolution#minimumreleaseage)).
- `trustPolicy: no-downgrade` refuses a release weaker in publisher trust than an earlier one, which is what a
  hijacked account publishing looks like ([pnpm](https://pnpm.io/settings/dependency-resolution#trustpolicy)).
- `engineStrict: true` refuses a Node outside `engines`, so every machine runs the version in `.node-version`.
- `peerDependencyRules` accepts any `vite`, because Vite+'s core carries its own version number, outside the ranges
  other packages ask for ([pnpm](https://pnpm.io/settings/peer-dependencies#peerdependencyrules)).
- `packageExtensions` gives Stryker a TypeScript 6 of its own. Its tsconfig rewrite reads TypeScript through the
  compiler's JavaScript API, which 7 replaced ([pnpm](https://pnpm.io/settings#packageextensions)).

## Tests and mutation

The three test tiers are set by file name in `vite.config.ts`, as [AGENTS.md](../AGENTS.md#tests) describes.
`do.test.ts` runs each `./do` script's shell suite against a stubbed copy of the repo, in the e2e tier.

Stryker mutates the unit-tested core: the model, its rules, the reporters and `src/app/diff.ts`, which run on
in-memory facts. Analysis, config loading, git and the CLI read the disk and spawn processes, too slow to run once
per mutant, so the integration and e2e tiers cover them. `stryker.vitest.config.ts` runs the unit tier alone.

## CI

- `ci.yml` fetches the base branch on a pull request, because `./do audit` compares the lockfile with the base's and
  a one-commit checkout has none. On `main` the audit compares the lockfile with itself, so it only warns.
- `mutate.yml` runs on `main` as well as on pull requests: a pull request's cache is scoped to its own merge ref, so
  only a run on `main` seeds the next pull request's
  ([GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache)).
  The cache key hashes every file Stryker reads besides the mutated ones, because an incremental run reuses results
  whatever changes in them ([Stryker](https://stryker-mutator.io/docs/stryker-js/incremental)). The cache is saved
  in its own step, since the cache action saves only on success and a failing run's results are worth keeping, and
  the report is uploaded on failure, since it says which mutants survived.
- `acceptance.yml` runs warp against working title at a pinned commit, nightly and on demand. It stays off pull
  requests because it reaches another repository and its answer moves with the model.
- `release.yml` publishes through npm trusted publishing: the registry trusts the workflow's OIDC token, so no npm
  token is stored ([npm](https://docs.npmjs.com/trusted-publishers)).
- Each action is pinned to a commit, with its version in a trailing `# v1.2.3` that Renovate keeps in step.
