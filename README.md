# warp

**Audience:** anyone running warp on a project, or deciding whether to.
**Purpose:** what warp does today and how to run it, with links to the pages for writing a config and wiring warp in.

Architectural fitness checks for TypeScript codebases. It builds a model of the codebase (the import graph, which
kind each module is, and the rules between kinds) and reports findings against it, as text for people, JSON or SARIF
for tools, and hook responses for coding agents. `diff` reports only what a change made new or worse, so it can run
after every edit. It covers module kinds, dependency direction, re-exports across kinds, cohesion and cognitive
complexity.

## Run it

Needs Node 26 or later. Install the CLI from a clone of this repo (run `pnpm setup` first if pnpm has no global bin
directory), and run `pnpm build` again after each pull, since the linked command runs the built `dist/`:

```sh
cd ~/src/warp   # wherever the clone is
pnpm install
pnpm build
pnpm link --global   # puts `warp` on your PATH
```

Or add it to one project as a dev dependency, and run it there with `pnpm exec warp`:

```sh
pnpm add -D link:~/src/warp
```

In the project to check, add a `warp.config.json`, or a `warp.config.ts`, next to its `tsconfig.json`, then:

```sh
warp check                 # every finding in the working tree
warp diff HEAD             # new or worse findings in the working tree since HEAD
warp diff main..feature    # new or worse findings between two refs
warp diff main...          # new or worse findings since the working tree's branch left main
```

| Flag | Effect |
| --- | --- |
| `--config <file>` | Config path. The project root is its directory. Default: the first of `warp.config.ts`, `.mts`, `.js`, `.mjs` and `.json` in the current directory. |
| `--ruleset <name>` | Check with a [ruleset](docs/config.md#rulesets), a named export of a `warp.config.ts`. Default: the default export. |
| `--print-config` | Print the config as resolved, with each kind's rules and options, and exit. Takes `--config` and `--ruleset`. |
| `--reporter <name>` | Output format, default `text`. |
| `--fail` | Exit 1 when there are findings (`check`) or new or worse ones (`diff`). Without it, both exit 0. |

| Reporter | Output |
| --- | --- |
| `text` | One line per finding, then a count. For `diff`, findings are marked `new` or `worse (was N)`. |
| `json` | `{ findings }` for `check`; `{ added, worsened, resolved }` for `diff`. Each finding has the same `message`. |
| `sarif` | SARIF 2.1.0 for GitHub code scanning: the findings to act on, with paths from the repository root. |
| `claude-hook` | A Claude Code PostToolUse hook response, or nothing when there is nothing to act on. |
| `omp` | An omp `tool_result` handler result, or nothing when there is nothing to act on. |

"To act on" means every finding for `check` and the new and worse ones for `diff`.

## A starter config

A starter for a hexagonal layout, to adjust to the project's folders:

```json
{
  "exclude": ["**/*.test.ts", "**/*.spec.ts"],
  "kinds": {
    "domain": { "match": "src/domain/**", "dependsOn": [] },
    "app": { "match": "src/app/**", "dependsOn": ["domain"] },
    "adapter": { "match": "src/adapters/**", "dependsOn": ["domain", "app"] },
    "utility": { "match": "src/lib/**", "dependsOn": [] },
    "entry": { "match": ["src/main.ts", "src/index.ts"], "dependsOn": ["domain", "app", "adapter", "utility"] }
  }
}
```

Run `warp check` and add globs until no `unclassified` findings are left. The other findings it reports are the
existing baseline, which `diff` leaves out, so they need no fixing first. Commit the config.

- [docs/config.md](docs/config.md): the config, archetypes, custom rules, rulesets and the rules.
- [docs/agents-and-ci.md](docs/agents-and-ci.md): how `diff` works, and running warp from Claude Code or GitHub code
  scanning.
- [integrations/omp/README.md](integrations/omp/README.md): running warp from omp.

## Compiler

Analysis uses the TypeScript 7.1 API (`typescript/sync`), pinned to `7.1.0-beta`, which runs the native compiler in a
child process. A spike confirmed it gives the AST, module resolution, and checker symbols with alias resolution, which
is what resolving through barrels needs, so ts-morph and a 5.x/6.x compiler were not needed. Each file's identifiers
are resolved in one batched checker call. The API is beta: expect to adjust when 7.1 ships.

## Limits

- Dynamic `import()`, `require()` and `import x = require()` are not edges yet.
- A namespace import (`import * as x`) points at the module the specifier resolves to, a barrel included.
- Class methods are not checked for cohesion against each other; each method gets the function rules.
