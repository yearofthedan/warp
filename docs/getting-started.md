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
import { all, archetype, defineConfig, dir, exposes, pkg } from '@yearofthedan/warp';

const app = archetype('app')
  .contains((c) =>
    c
      .module('utils', dir('src/utils'), exposes(all()))
      .module('db', dir('src/db'), exposes(all()))
      .module('api', dir('src/api'), exposes(all()).using((m) => [m.db, m.utils, pkg('*')])),
  );

export default defineConfig({ root: app });
```

- `archetype('app')` is the shape of the project's root folder, and `c` builds the [modules](concepts.md#module)
  inside it. `dir('src/api')` makes the folder `src/api` a module.
- `exposes(all())` lets other modules import every file of the module. A module
  [exposes](concepts.md#exposes-and-surface) nothing until it says so.
- `using((m) => [...])` is what the module may import. `m` holds the modules declared above it, so `api`, declared
  last, may use `db` and `utils`. `pkg('*')` lets it import any package.

## 3. See how warp reads it

```sh
pnpm exec warp model
```

```text
.  root: app
  loose: src/index.ts
  loose: src/lib/format.ts
  src/utils  utils: app.utils, 1 file
  src/db  db: app.db, 1 file
  src/api  api: app.api, 2 files

4 modules, 6 files, 2 loose.
```

Each line is a module, its archetype and its files. The 4 modules are the root, `.`, and the three the config
declares. `src/index.ts` and `src/lib/format.ts` are [loose](concepts.md#loose-file): no module holds them yet.

## 4. Check it

```sh
pnpm exec warp check
```

```text
src/index.ts:1 [unclassified] src/index.ts is in no module of . (app), so nothing says what it may import. Add a files module to app that matches it, or move it into a module's folder.
src/lib/format.ts:1 [unclassified] src/lib/format.ts is in no module of . (app), so nothing says what it may import. Add a files module to app that matches it, or move it into a module's folder.
src/api/orders.ts:3 [dependency-direction] src/api/orders.ts (app.api src/api) imports src/lib/format.ts (loose in app .), which is in no module yet. Add a module that holds src/lib/format.ts, then add it to a using if the dependency is intended.

By rule and module:
  unclassified          .        2
  dependency-direction  src/api  1

3 findings
```

Each [finding](concepts.md#finding) is a file and line, the rule in brackets, what is wrong, and how to fix it.
[Fixing findings](fixing-findings.md) explains how to choose between the fixes. All three come from the two loose
files.

## 5. Give every file a module

`lib` is a folder of its own, so give it a module above `api`, and let `api` use it. `src/index.ts` is the project's
[entry](concepts.md#entry), its one way in. The changed lines:

```diff
-import { all, archetype, defineConfig, dir, exposes, pkg } from '@yearofthedan/warp';
+import { all, archetype, defineConfig, dir, exposes, files, pkg } from '@yearofthedan/warp';

 const app = archetype('app')
   .contains((c) =>
     c
+      .module('lib', dir('src/lib'), exposes(all()))
       .module('utils', dir('src/utils'), exposes(all()))
       .module('db', dir('src/db'), exposes(all()))
-      .module('api', dir('src/api'), exposes(all()).using((m) => [m.db, m.utils, pkg('*')])),
-  );
+      .module('api', dir('src/api'), exposes(all()).using((m) => [m.db, m.lib, m.utils, pkg('*')])),
+  )
+  .entry(files('src/index.ts'));
```

```sh
pnpm exec warp check
```

```text
No findings.
```

On a real codebase, findings remain once nothing is `unclassified`. Each one says the config and the code disagree,
and you choose which is wrong: change the config if the design allows what the code does, or fix the code if it
doesn't. If `src/utils/slug.ts` imported `db` today, either declare `utils` after `db` and add `m.db` to its `using`,
or move the query out of `slug.ts`. [Fixing findings](fixing-findings.md) helps with the choice.

They needn't all be settled before you commit the config. Code scanning shows a pull request only the findings it
adds, and `warp diff` shows an agent only those its edit adds, so the findings there today can be worked through one
at a time.

## 6. Check the project, and each edit

`warp check` judges the whole codebase, so it is the check for CI and the project's own check script. With `--fail`
it exits 1 on any finding:

```sh
pnpm exec warp check --fail
```

`warp diff` is for the edit loop. `warp diff HEAD` reports what the working tree made new or worse since the last
commit. Here an edit made `src/utils/slug.ts` import from `db`:

```sh
pnpm exec warp diff HEAD
```

```text
new: src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (app.utils src/utils) imports src/db/client.ts (app.db src/db), which is outside utils's reach: utils may use nothing. Add what holds src/db/client.ts to a using if the dependency is intended, or move the code.

1 new finding, 0 worsened, 0 resolved.
```

[Agents and CI](agents-and-ci.md) runs it after each edit of a coding agent, and `warp check` on pull requests.

## 7. Tighten one `using` at a time

Each change to a `using` makes the config stricter. Replacing `pkg('*')` with `pkg('zod')` limits `api` to the
package it uses, so a new package becomes a decision. `warp check` then reports the test's import of vitest:

```text
src/api/orders.test.ts:1 [module-externals] src/api/orders.test.ts (app.api src/api) imports vitest, a package outside api's reach: app.api uses pkg('zod'). Add pkg('vitest') to a using if the dependency is intended, or move the code.
```

## 8. Tell warp which files are tests

warp treats `orders.test.ts` as production code until a test module holds it. Declare one, and give every test the
test runner:

```ts
// warp.config.ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

const app = archetype('app')
  .contains((c) =>
    c
      .module('lib', dir('src/lib'), exposes(all()))
      .module('utils', dir('src/utils'), exposes(all()))
      .module('db', dir('src/db'), exposes(all()))
      .module('api', dir('src/api'), exposes(all()).using((m) => [m.db, m.lib, m.utils, pkg('zod')]))
      .testModule('tests', files('src/**/*.test.ts')),
  )
  .entry(files('src/index.ts'))
  .testUsing([pkg('vitest')]);

const base = ruleset().on(app.modules.tests, { 'function-cohesion': false });

export default defineConfig({ root: app, rulesets: { default: base } });
```

- `.testModule('tests', files('src/**/*.test.ts'))` makes the test files a [test module](concepts.md#test-module) of
  the root. Its tests reach what the root reaches, each module's surface, and nothing in production may import them.
- `.testUsing([pkg('vitest')])` is the [test kit](concepts.md#test-kit): every test module at and below the root may
  import vitest. A module deeper down adds to it for its own tests: with
  `contains((c) => c.testModule('tests', files('*.test.ts'))).exposes(all()).testUsing([pkg('testcontainers')])` on
  `db`, the tests in `src/db` import vitest and testcontainers, and the tests in `src/api` import vitest alone.
- The ruleset turns `function-cohesion` off for the root's tests alone, since a `describe` callback holds `it` calls
  that share no locals, which that rule would report as a function to split. Production code keeps the rule. Quiet a
  rule for tests the same way, with `.on()` on the test module, and the rule still judges the code it was made for.

`warp check` reports no findings again, and `warp model` lists `orders.test.ts` under `(root):tests`.

The [hexagonal layout](examples/hexagonal.md) shows a stricter config, and the [config reference](config.md) has every
option.
