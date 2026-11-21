# 1. Vite+ for checks and tests, plain tsc for the build

Status: Accepted, 2026-11-21

## Context

Which tools format, lint, type-check, test and build warp, and guard what it depends on?

- **Ships to users.** warp is installed into other projects, so every runtime dependency is theirs too, and a
  compromised one reaches them.
- **Compiler API.** warp's analysis is the TypeScript 7.1 API (`typescript/sync`). The build and the type check must
  use that same compiler, not one a tool bundles.
- **Agents copy.** Agents write most of the code: every extra config and command is another pattern to copy wrongly.
- **Keeping in step.** Tools released separately are upgraded separately, and one can break another.
- **Tests as a design check.** The model and rules must stay testable without the disk or a TypeScript program, and
  mutation testing is how that is kept honest.

## Options considered

| Option | Ships to users | Compiler API | Agents copy | Keeping in step |
| --- | --- | --- | --- | --- |
| Vite+ for format, lint and tests; pinned `tsc` for types and build | Nothing added at runtime | Same 7.1 for analysis, types and build | One config, one command | One version for the tools, one for TypeScript |
| Vite+ including its bundled type check and a bundled build | Nothing added at runtime | Vite+'s TypeScript, not the pinned one | One config | One version, but two compilers |
| Biome, Vitest and a hook manager, as in weaver | Nothing added at runtime | Same 7.1 | Three configs | Three versions |

## Decision

Vite+ formats (oxfmt), lints (oxlint) and tests (`vp test`), and installs the git hooks, from `vite.config.ts`. Its
type-aware lint and type check stay off: the pinned `typescript` 7.1 type-checks (`tsc -p tsconfig.json`) and builds
(`tsc -p tsconfig.build.json`, with `rewriteRelativeImportExtensions`, no bundler). `typescript` is the only runtime
dependency. Stryker mutates the unit-tested core, with its own TypeScript 6 through `packageExtensions`, since its
tsconfig rewrite needs the JavaScript API below 7.

Dependencies come in through `./do add`, which audits a resolution before installing it, under the pnpm policy in
`pnpm-workspace.yaml`: exact versions, a three-day minimum release age and no trust downgrades. Renovate waits the same
three days.

**Ships to users** and **Compiler API** decided it. Biome lost on **Agents copy** and **Keeping in step**, and working
title already runs Vite+, so the two projects share a pattern.

## Consequences

`./do check` is the one local check. Type-aware lint returns when Vite+ ships TypeScript 7.1. The mutation threshold
starts at the score the existing unit tests reach and rises as slices add unit tests, toward 90. Leaving Vite+ means
rewriting the lint config and each test's imports.
