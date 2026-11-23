# Contributing

## Running a clone

To try a change on another project, link the CLI from a clone. Run `pnpm setup` first if pnpm has no global bin
directory, and `pnpm build` again after each pull, since the linked command runs the built `dist/`:

```sh
cd ~/src/warp   # wherever the clone is
pnpm install
pnpm build
pnpm link --global   # puts `warp` on your PATH
```

Or link it into one project as its dev dependency: `pnpm add -D link:~/src/warp`.

## Compiler

Analysis uses the TypeScript 7.1 API (`typescript/sync`), which runs the native compiler in a child process and gives
the AST, module resolution and checker symbols with alias resolution. It is pinned to `7.1.0-beta`, so expect to adjust
when 7.1 ships. Each file's identifiers are resolved in one batched checker call.

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

`vite.config.ts` sets the three test tiers by file name: unit `*.test.ts`, integration `*.integration.test.ts`, and e2e
`e2e/` with `do.test.ts`. The integration tier resolves `@yearofthedan/warp` to `src/index.ts`, as the config loader does, so it can
load the fixtures' configs; `tsconfig.json` maps it the same way for `warp.config.ts`.
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
