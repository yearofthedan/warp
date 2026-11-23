# Getting started

**Audience:** someone adding warp to a TypeScript project for the first time, person or agent.
**Purpose:** a walk from install to a clean `warp check` and a first `warp diff`, on a small project.

The walk uses this project. Yours will differ in names, and the steps are the same:

```text
src/
├── api/
│   ├── orders.ts       imports db, lib, utils and zod
│   └── orders.test.ts  imports orders.ts and vitest
├── db/client.ts
├── lib/format.ts
├── utils/slug.ts
└── index.ts            re-exports api/orders.ts
```

## 1. Install

warp needs Node 26 or later.

```sh
pnpm add -D @yearofthedan/warp
```

## 2. Describe the project as it is

Start with a config that holds what the code already does: a module per folder, each exposing all its files, and
each using what it imports today. Put it next to `tsconfig.json`:

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

Line by line:

- `archetype('app')` is the shape of the project's root folder, and `c` builds the [modules](concepts.md#module)
  inside it. `dir('src/api')` makes the folder `src/api` a module.
- `exposes(all())` lets other modules import every file of the module. A module
  [exposes](concepts.md#exposes-and-surface) nothing until it says so.
- `using((m) => [...])` is what the module may import. `m` holds the modules declared above it, so `api`, declared
  last, may use `db` and `utils`. `pkg('*')` lets it import any package.
- `.entry(files('src/index.ts'))` makes `src/index.ts` the project's [entry](concepts.md#entry).
- `tests: files('src/**/*.test.ts')` names the test files, and `.tests(using([pkg('vitest')]))` lets every test
  import vitest. The ruleset turns `function-cohesion` off for tests, since a `describe` callback holds `it` calls that
  share no locals.

## 3. See how warp reads it

```sh
pnpm exec warp model
```

```text
.  root: app, 1 file
  loose: src/lib/format.ts
  src/utils  utils: app.utils, 1 file
  src/db  db: app.db, 1 file
  src/api  api: app.api, 1 file, 1 test

4 modules, 5 files, 1 test, 1 loose.
```

Each line is a module, its archetype and its files. `src/lib/format.ts` is [loose](concepts.md#loose-file): no module
holds it yet.

## 4. Check it

```sh
pnpm exec warp check
```

```text
src/lib/format.ts:1 [unclassified] src/lib/format.ts is in no module of . (app), so nothing says what it may import. Add a files module to app that matches it, or move it into a module's folder.
src/api/orders.ts:3 [dependency-direction] src/api/orders.ts (app.api src/api) imports src/lib/format.ts (loose in app .), which is above src/api. A module reaches up only through what it requires: require it in app and have an ancestor provide it, or move it below.

By rule and module:
  dependency-direction  src/api  1
  unclassified          .        1

2 findings
```

Each [finding](concepts.md#finding) is a file and line, the rule in brackets, what is wrong, and how to fix it.
[Fixing findings](fixing-findings.md) explains how to choose between the fixes.

## 5. Add modules until nothing is loose

`lib` is a folder of its own, so give it a module, above `api`, and let `api` use it:

```ts
// warp.config.ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

const app = archetype('app')
  .contains((c) =>
    c
      .module('lib', dir('src/lib'), exposes(all()))
      .module('utils', dir('src/utils'), exposes(all()))
      .module('db', dir('src/db'), exposes(all()))
      .module('api', dir('src/api'), exposes(all()).using((m) => [m.db, m.lib, m.utils, pkg('*')])),
  )
  .entry(files('src/index.ts'))
  .tests(using([pkg('vitest')]));

const base = ruleset().on(app.modules.tests, { 'function-cohesion': false });

export default defineConfig({ root: app, tests: files('src/**/*.test.ts'), rulesets: { default: base } });
```

```sh
pnpm exec warp check
```

```text
No findings.
```

On a real codebase, the findings left once nothing is `unclassified` are its existing baseline. `warp diff` leaves
the baseline out, so it needs no fixing first. Commit the config.

## 6. Check each change

`warp diff HEAD` reports what the working tree made new or worse since the last commit. Here an edit made
`src/utils/slug.ts` import from `db`:

```sh
pnpm exec warp diff HEAD
```

```text
new: src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (app.utils src/utils) imports src/db/client.ts (app.db src/db), which is outside utils's reach, its own files only. Add what holds src/db/client.ts to a using if the dependency is intended, or move the code.

1 new finding, 0 worsened, 0 resolved.
```

[Agents and CI](agents-and-ci.md) runs the same command after each edit of a coding agent, and on pull requests.

## 7. Tighten one entry at a time

Each change to the config makes a rule stricter. Replacing `pkg('*')` with `pkg('zod')` limits `api` to the package
it uses today, so a new package becomes a decision. An import of `dayjs` in `api` is then reported:

```text
src/api/orders.ts:1 [module-externals] src/api/orders.ts (app.api src/api) imports dayjs, a package outside api's reach: app.api uses pkg('zod'). Add pkg('dayjs') to a using if the dependency is intended, or move the code.
```

The [hexagonal layout](examples/hexagonal.md) shows a stricter config, and the [config reference](config.md) has every
option.
