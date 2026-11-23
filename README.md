# warp

**Audience:** anyone running warp on a project, or deciding whether to.
**Purpose:** what warp does today and how to run it, with links to the pages for writing a config and wiring warp in.

warp checks a TypeScript codebase against a declared model of its modules. A `warp.config.ts` names the modules and
what each may use, and warp reports the code that steps outside it:

- imports outside a module's reach, including packages it doesn't list.
- imports and re-exports that go around a module's surface.
- import loops between files and between modules.
- files and functions that are too large or too tangled to follow.
- parts of the config that the code no longer uses.

`warp diff` reports only what a change made new or worse, so it can run on a pull request or after every edit of a
coding agent. The [rules table](docs/config.md#rules) lists each check.

## Run it

Needs Node 26 or later. Add warp to the project as a dev dependency:

```sh
pnpm add -D @yearofthedan/warp
```

Add a `warp.config.ts` next to the project's `tsconfig.json`, then:

```sh
pnpm exec warp check                 # every finding in the working tree
pnpm exec warp diff HEAD             # new or worse findings in the working tree since HEAD
pnpm exec warp diff main..feature    # new or worse findings between two refs
pnpm exec warp diff main...          # new or worse findings since the working tree's branch left main
pnpm exec warp model                 # the modules the config finds, and the module each file is in
```

| Flag | Effect |
| --- | --- |
| `--config <file>` | Config path. The project root is its directory. Default: the first of `warp.config.ts`, `.mts`, `.js` and `.mjs` in the current directory. |
| `--ruleset <name>` | Check with one of the config's [rulesets](docs/config.md#rulesets). Default: the one named `default`, if any. |
| `--since-last-run` | With `diff` and no head, compare the working tree with its findings at the last run with this flag. The first run, and the first after `HEAD` moves, compares with the base. |
| `--rules` | With `model`, list the rule settings each module changes. |
| `--json` | With `model`, print the model as JSON, with every module's resolved rule settings. |
| `--reporter <name>` | Output format, default `text`. |
| `--fail` | Exit 1 when there are findings (`check`) or new or worse ones (`diff`). Without it, both exit 0. |

| Reporter | Output |
| --- | --- |
| `text` | One line per finding, then for `check` the findings counted by rule and module, and a total. For `diff`, findings are marked `new` or `worse (was N)`. |
| `json` | `{ findings }` for `check`; `{ added, worsened, resolved }` for `diff`. Each finding has the same `message`. |
| `sarif` | SARIF 2.1.0 for GitHub code scanning: the findings to act on, with paths from the repository root. |
| `claude-hook` | A Claude Code PostToolUse hook response, or nothing when there is nothing to act on. |
| `omp` | An omp `tool_result` handler result, or nothing when there is nothing to act on. |

"To act on" means every finding for `check` and the new and worse ones for `diff`.

## A starter config

Start by describing the codebase as it is: one module per top-level folder, each exposing all its files and using
what it imports today. For a project with `src/api`, `src/db` and `src/utils`:

```ts
// warp.config.ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

const app = archetype('app')
  .contains((c) =>
    c
      .module('utils', dir('src/utils'), exposes(all()))
      .module('db', dir('src/db'), exposes(all()))
      .module('api', dir('src/api'), exposes(all()).using((m) => [m.db, m.utils, pkg('*')])),
  )
  .entry(files('src/index.ts'))
  .tests(using([pkg('vitest')]));

const base = ruleset().on(app.modules.tests, { 'function-cohesion': false });

export default defineConfig({ root: app, tests: files('src/**/*.test.ts'), rulesets: { default: base } });
```

`c` builds the archetype's modules, and `m` in a `using` is the modules declared before it, so a module can only use
the ones above it. `pkg('*')` lets `api` import any package. `src/index.ts` is the project's front door. The tests
belong to the root module, so they see every module's files and the test runner. `function-cohesion` is off for them,
because a `describe` callback holds `it` calls that share no locals.

Run `warp check` and add modules until no `unclassified` findings are left. The other findings are the existing
baseline, which `diff` leaves out, so they need no fixing first. Commit the config.

After that, `warp diff HEAD` reports what an edit breaks. Here an edit made `utils` import from `db`:

```text
new: src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (app.utils src/utils) imports src/db/client.ts (app.db src/db), which is outside utils's reach, its own files only. Add what holds src/db/client.ts to a using if the dependency is intended, or move the code.
```

Tighten one entry at a time. Replacing `pkg('*')` with `pkg('zod')` makes any other package that `api` imports a
finding. [docs/examples/hexagonal.md](docs/examples/hexagonal.md) shows a stricter layout.

- [docs/concepts.md](docs/concepts.md): what warp's terms mean, from module to finding.
- [docs/config.md](docs/config.md): the config, custom rules, rulesets and the rules.
- [docs/agents-and-ci.md](docs/agents-and-ci.md): how `diff` works, and running warp from Claude Code or GitHub code
  scanning.
- [integrations/omp/README.md](integrations/omp/README.md): running warp from omp.

## Limits

- Dynamic `import()`, `require()` and `import x = require()` are not edges yet.
- A namespace import (`import * as x`) points at the module the specifier resolves to, a barrel included.
- Class methods are not checked for cohesion against each other; each method gets the function rules.
