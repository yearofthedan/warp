# warp

warp checks a TypeScript codebase against a declared model of its modules. A `warp.config.ts` names the modules and
what each may use, and warp reports the code that steps outside it:

- imports outside a module's reach, including packages it doesn't list.
- imports and re-exports that go around a module's surface.
- import loops between files and between modules.
- files and functions that are too large or too tangled to follow.
- parts of the config that the code no longer uses.

`warp diff` reports only what a change made new or worse, so it can run on a pull request or after every edit of a
coding agent.

## Quick start

warp needs Node 26 or later. Add it to the project as a dev dependency:

```sh
pnpm add -D @yearofthedan/warp
```

Describe the codebase as it is, one module per folder under `src/`, in a `warp.config.ts` next to the project's
`tsconfig.json`:

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

Then check it, and after an edit, see what the edit broke:

```sh
pnpm exec warp check      # every finding in the working tree
pnpm exec warp diff HEAD  # what changed since the last commit made new or worse
```

```text
new: src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (app.utils src/utils) imports src/db/client.ts (app.db src/db), which is outside utils's reach, its own files only. Add what holds src/db/client.ts to a using if the dependency is intended, or move the code.
```

## Read next

- [Getting started](docs/getting-started.md): from this config to a clean `warp check` and a first `diff`, step by
  step.
- [Fixing findings](docs/fixing-findings.md): how to read a finding and decide between changing the code and changing
  the config.
- [Concepts](docs/concepts.md): what each of warp's terms means.
- [Config](docs/config.md) and [CLI](docs/cli.md): the reference for each.
- [Rules](docs/rules.md): every rule warp checks, each with its page.
- [Agents and CI](docs/agents-and-ci.md): running warp after each edit of Claude Code or omp, and on pull requests.
- [Hexagonal layout](docs/examples/hexagonal.md): a stricter config, for ports and adapters.

## Limits

- warp follows static `import` and `export … from` declarations. Dependencies through `import()`, `require()` and
  `import x = require()` go unchecked.
- A namespace import (`import * as x`) points at the module the specifier resolves to, a barrel included.
- Each class method is checked as a function of its own, and a class is one member of its file.
