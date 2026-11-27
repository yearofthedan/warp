# Agents' guide

**Audience:** every agent working in this repo.
**Purpose:** tells an agent how work runs here and where the rest of the rules live.

warp checks a TypeScript codebase against a declared model of its modules, to keep it modular.
[docs/concepts.md](docs/concepts.md) defines its terms, and [docs/config.md](docs/config.md) is the source of truth
for the config language.

## Read before changing code

- [README.md](README.md): what warp does today and its CLI.
- [docs/config.md](docs/config.md): the config language and rulesets. [docs/rules.md](docs/rules.md) lists the rules,
  and [docs/custom-rules.md](docs/custom-rules.md) covers plugins.
- [docs/concepts.md](docs/concepts.md): what each of warp's terms means, on one example.
- [docs/adr/](docs/adr/README.md): why each decision was made. Read the record before changing what it decided.
- [CONTRIBUTING.md](CONTRIBUTING.md): running a clone, and why each compiler, tool, CI and dependency setting is there.

## Running tasks

Every task runs through `./do`, never the tools underneath: `./do` alone lists them. A new task is a file in
`scripts/`, never a `package.json` script. A dependency is added with `./do add`, never `pnpm add`: it audits what the
resolution brought in first, and whatever warp depends on ships to its users. `typescript` and `yaml` are the only
runtime dependencies; adding another needs an ADR.

`./do check` is the one local check, and CI runs it. It ends with warp checking itself from source against
[warp.yaml](warp.yaml).

## Tests

Tests sit beside the code they test, in three tiers named by suffix:

- `src/**/x.test.ts`: unit. In memory, on facts built by hand: no disk, no TypeScript program. `./do mutate` mutates
  the modules these cover.
- `src/**/x.integration.test.ts`: integration. Analysis and config loading against the small repos in `fixtures/`.
- `e2e/*.test.ts`: end to end. Spawns `node src/cli.ts` against copies of `fixtures/`.
- `src/**/scenarios/*.approved.md`: scenarios, played in the e2e tier. Each gives a project's files and a warp command,
  and holds everything warp printed. `./do approve <file>` records it; see [CONTRIBUTING.md](CONTRIBUTING.md#scenarios).

`./do test --project unit` (or `integration`, `e2e`) runs one tier. `./do acceptance` checks working title at a pinned
commit against approved findings; CI runs it after `./do check`.

## Adding a rule

A built-in rule is a folder in [src/builtins/](src/builtins): the rule in `rule.ts`, its unit tests, its scenarios and its
page as the folder's `README.md`. [src/builtins/index.ts](src/builtins/index.ts) lists it. A new rule's page has the
same sections as the others, and gets a row in the rules table in [docs/rules.md](docs/rules.md).

## Comments and docs

Code explains itself through names, types and tests. A comment is for something temporary: it says why it is there
and what ends it, in two lines.

```ts fragment
// why: type-aware linting runs on the TypeScript Vite+ bundles, older than the 7.1 warp builds with.
// until: vite-plus bundles typescript@7.1
```

`until:` names something checkable: an issue or pull request, a URL, a `package@version` or a date. Free text passes
and is listed for review. A reason that lasts belongs in a name, a test or a doc. Directives such as
`@ts-expect-error` and `oxlint-disable` carry the same two lines, and in a test `// @ts-expect-error <what>` is an
assertion that stands alone. `./do comments` checks every file warp keeps.

Each doc page opens with its title, an **Audience:** line and a **Purpose:** line. A conventional root file, such as
`README.md` or `CONTRIBUTING.md`, follows its convention instead. `./do docs` type-checks each `ts`
block against warp's API; a block of a user's code is `ts fragment`. Keep pages short and current, changed in the
same change as the code they describe.

## How work lands

- Never push to `main`. A change lands by pull request, merged with a merge commit or squash.
- Commit subjects are [conventional commits](https://www.conventionalcommits.org/): release-please reads them to
  version and write the changelog, and the `commit-msg` hook refuses any other subject.

## Dated records stay as written

A change across the repo, such as a find and replace, leaves dated records as they are: merged pull requests' bodies
and decision records once Accepted hold what was true when written.
