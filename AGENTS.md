# Agents' guide

**Audience:** every agent working in this repo.
**Purpose:** tells an agent how work runs here and where the rest of the rules live.

warp checks a TypeScript codebase against a declared model of its modules, to keep it modular. The model's design is
[docs/design/archetypes.md](docs/design/archetypes.md), the source of truth for the config language.

## Read before changing code

- [README.md](README.md): what warp does today, its CLI, config and rules.
- [docs/design/archetypes.md](docs/design/archetypes.md): where the config language is going.
- [docs/adr/](docs/adr/README.md): why each decision was made. Read the record before changing what it decided.

## Running tasks

Every task runs through `./do`, never the tools underneath: `./do` alone lists them. A new task is a file in
`scripts/`, never a `package.json` script. A dependency is added with `./do add`, never `pnpm add`: it audits what the
resolution brought in first, and whatever warp depends on ships to its users. `typescript` is the only runtime
dependency; adding a second needs an ADR.

`./do check` is the one local check, and CI runs it. It ends with warp checking itself from source against
[warp.config.json](warp.config.json).

## Tests

Tests sit beside the code they test, in three tiers named by suffix:

- `src/**/x.test.ts`: unit. In memory, on facts built by hand: no disk, no TypeScript program. `./do mutate` mutates
  the modules these cover.
- `src/**/x.integration.test.ts`: integration. Analysis and config loading against the small repos in `fixtures/`.
- `e2e/*.test.ts`: end to end. Spawns `node src/cli.ts` against copies of `fixtures/`.

`./do test --project unit` (or `integration`, `e2e`) runs one tier. `./do acceptance` checks working title at a pinned
commit against approved findings; it runs nightly in CI, not on pull requests.

## How work lands

- Never push to `main`. A change lands by pull request, merged with a merge commit or squash.
- Commit subjects are [conventional commits](https://www.conventionalcommits.org/): release-please reads them to
  version and write the changelog, and the `commit-msg` hook refuses any other subject.

## Dated records stay as written

A change across the repo, such as a find and replace, leaves dated records as they are: merged pull requests' bodies,
the history notes in docs/design/archetypes.md and decision records once Accepted hold what was true when written.
