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
└── index.ts            imports api/orders.ts
```

## 1. Install

warp needs Node 26 or later.

```sh
pnpm add -D @yearofthedan/warp
```

## 2. Describe the project as it is

Start with a config that holds what the code already does: a module per folder, each exposing all its files, and
each depending on what it imports today. Put it in `warp.yaml`, next to the project's `tsconfig.json`. warp reads the
files that tsconfig includes; with no `tsconfig.json`, add one, or name yours with `tsconfig: [tsconfig.app.json]`:

```yaml
root:
  modules:
    utils: { dir: src/utils, exposes: all }
    db: { dir: src/db, exposes: all }
    api: { dir: src/api, dependencies: [db, utils, 'npm:*'], exposes: all }
  ruleset: [warp:recommended]
```

- `root` is the project's folder, and each key under its `modules` is a [module](concepts.md#module).
  `dir: src/api` makes the folder `src/api` a module.
- `exposes: all` lets other modules import every file of the module. A module
  [exposes](concepts.md#exposes-and-surface) nothing until it says so.
- `dependencies` is what the module may import: `api` may import `db` and `utils`, and `'npm:*'` lets it import any
  package.
- The root's `ruleset` runs warp's recommended rules here and in every module inside. With no ruleset, no rule runs,
  and `warp check` says so.

## 3. See how warp reads it

```sh
pnpm exec warp model
```

```text
(root)  root: root
  loose: src/index.ts
  loose: src/lib/format.ts
  src/utils  utils: root.utils, 1 file
  src/db  db: root.db, 1 file
  src/api  api: root.api, 2 files

4 modules, 6 files, 2 loose.
```

Each line is a module, its name and its files. The 4 modules are the root, `(root)`, and the three the config
declares. `src/index.ts` and `src/lib/format.ts` are [loose](concepts.md#loose-file): no module holds them yet.

## 4. Check it

```sh
pnpm exec warp check
```

```text
src/index.ts:1 [unclassified] src/index.ts is in no module of the root, so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.
src/lib/format.ts:1 [unclassified] src/lib/format.ts is in no module of the root, so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.
src/api/orders.ts:3 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/lib/format.ts (loose in root (root)), which is in no module yet. Add a module that holds src/lib/format.ts, then add it to the importer's dependencies if the dependency is intended.

By rule and module:
  unclassified          (root)   2
  dependency-direction  src/api  1

3 findings
```

Each [finding](concepts.md#finding) is a file and line, the rule in brackets, what is wrong, and how to fix it.
[Fixing findings](fixing-findings.md) explains how to choose between the fixes. All three come from the two loose
files.

## 5. Give every file a module

`lib` is a folder of its own, so give it a module, and let `api` depend on it. `src/index.ts` starts the project, so
give it a files module that depends on `api`. The changed lines:

```diff
 root:
   modules:
+    lib: { dir: src/lib, exposes: all }
     utils: { dir: src/utils, exposes: all }
     db: { dir: src/db, exposes: all }
-    api: { dir: src/api, dependencies: [db, utils, 'npm:*'], exposes: all }
+    api: { dir: src/api, dependencies: [db, lib, utils, 'npm:*'], exposes: all }
+    main: { files: src/index.ts, dependencies: [api] }
```

```sh
pnpm exec warp check
```

```text
No findings.
```

On a real codebase, findings remain once nothing is `unclassified`. Each one says the config and the code disagree,
and you choose which is wrong: change the config if the design allows what the code does, or fix the code if it
doesn't. If `src/utils/slug.ts` imported `db` today, either add `db` to the dependencies of `utils`, or move the query
out of `slug.ts`. [Fixing findings](fixing-findings.md) helps with the choice.

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
new: src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (root.utils src/utils) imports src/db/client.ts (root.db src/db), which is outside utils's reach. Add db to root.utils.dependencies (warp.yaml:4), or move the code.

1 new finding, 0 worsened, 0 resolved.
```

[Agents and CI](agents-and-ci.md) runs it after each edit of a coding agent, and `warp check` on pull requests.

## 7. Tighten one module's dependencies at a time

Each narrower `dependencies` makes the config stricter. Replacing `'npm:*'` with `npm:zod` limits `api` to the
package it uses, so a new package becomes a decision. `warp check` then reports the test's import of vitest:

```text
src/api/orders.test.ts:1 [module-externals] src/api/orders.test.ts (root.api src/api) imports vitest, a package outside api's reach. Add npm:vitest to root.api.dependencies (warp.yaml:6), or move the code. (+1 more in reach)
```

## 8. Tell warp which files are tests

warp treats `orders.test.ts` as production code until a test module holds it. Declare one, and give every test the
test runner:

```yaml
# warp.yaml
root:
  modules:
    lib: { dir: src/lib, exposes: all }
    utils: { dir: src/utils, exposes: all }
    db: { dir: src/db, exposes: all }
    api: { dir: src/api, dependencies: [db, lib, utils, npm:zod], exposes: all }
    main: { files: src/index.ts, dependencies: [api] }
  test:
    provides: [npm:vitest]
    modules:
      tests: { files: 'src/**/*.test.ts' }
    ruleset: { rules: { function-cohesion: off } }
  ruleset: [warp:recommended]
```

- `test: { modules: { tests: ... } }` makes the test files a [test module](concepts.md#test-module) of the root. Its
  tests reach what the root reaches, each module's surface, and nothing in production may import them.
- `provides: [npm:vitest]` is the [test kit](concepts.md#test-kit): every test module inside the root may import
  vitest. A module deeper down adds to it for its own tests: with
  `test: { provides: [npm:testcontainers], modules: { tests: { files: '*.test.ts' } } }` on `db`, the tests in
  `src/db` import vitest and testcontainers, and the tests in `src/api` import vitest alone.
- The test block's `ruleset` turns `function-cohesion` off for every test module inside the root, since a `describe`
  callback holds `it` calls that share no locals, which that rule would report as a function to split. Production
  code keeps the rule. To quiet a rule for one test module alone, give that module the ruleset instead, as
  `tests: { files: 'src/**/*.test.ts', ruleset: { rules: { function-cohesion: off } } }`.

`warp check` reports no findings again, and `warp model` lists `orders.test.ts` under `(root):tests`.

The [hexagonal layout](examples/hexagonal.md) shows a stricter config, and the [config reference](config.md) has every
option.
