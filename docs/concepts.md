# Concepts

**Audience:** anyone, person or agent, learning what warp's terms mean.
**Purpose:** each term in one place, defined on the project from [getting-started.md](getting-started.md).

Each term gets a short definition and an example. [config.md](config.md) holds the syntax and the detail.

## The example

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

```yaml
root:
  modules:
    lib: { dir: src/lib, exposes: all }
    utils: { dir: src/utils, exposes: all }
    db: { dir: src/db, exposes: all }
    api: { dir: src/api, dependencies: [db, lib, utils, 'npm:*'], exposes: all }
    main: { files: src/index.ts, dependencies: [api] }
  test:
    provides: [npm:vitest]
    modules:
      tests: { files: 'src/**/*.test.ts' }
    ruleset: { rules: { function-cohesion: off } }
  ruleset: { extends: [warp:recommended] }
```

`warp model` reads it as:

```text
(root)  root: root
  src/lib  lib: root.lib, 1 file
  src/utils  utils: root.utils, 1 file
  src/db  db: root.db, 1 file
  src/api  api: root.api, 1 file
  (root):main  1 file
  (root):tests  1 test file

7 modules, 5 files, 1 test file, 0 loose.
```

## Structure

### Config

The `warp.yaml` beside the project's tsconfig: the codebase's modules, what each may use, and the rulesets that
judge them.

### Module

A boundary warp checks imports across, declared as a key under `modules:`. Every file belongs to at most one module.

- A **folder module** has `dir`, one per folder that matches, and is named by its folder: `src/api`. The **root
  module** is the config's folder, `(root)`.
- A **files module** has `files`: some of its folder module's files, by pattern, named `folder:name`. A `generated`
  module of `files: '**/*.gen.ts'` inside `src/api` would be `src/api:generated`.
- A **test module** sits under a `test:` block and holds test code. See [Test module](#test-module).

### Archetype

A module defined on its own, behind what it requires and what it exposes, under `archetypes:`. A module that names
it with `archetype:` is one of its instances, and with `dir: 'src/*'` each matching folder is one. A module with
`modules:` of its own and no `archetype` is an archetype written in place, named by its path. See
[config.md](config.md#archetypes).

### Loose file

A file in a folder module that none of its files modules matches. Before `lib` had a module, `src/lib/format.ts` was
loose, and [`unclassified`](../src/builtins/unclassified/README.md) reported it.

### Model

The modules and files warp resolves from the config and the file system, before any rule runs. `warp model` prints
it, as above.

## What a file may import

### Dependencies

What a module's files may import, and the only permission there is. `api` names `[db, lib, utils, 'npm:*']`. Each
module names its own: `lib` names none, so its files import nothing outside it.

### Package

An `npm:` or `node:` entry in `dependencies`, for imports of npm or Node packages. `'npm:*'` lets `api` import any
package, and `npm:zod` only zod. A package import outside the importer's reach is a
[`module-externals`](../src/builtins/module-externals/README.md) finding.

### Reach

Everything one file may import: the rest of its module, and what its module's `dependencies` name.
`src/api/orders.ts` reaches `src/db`, `src/lib`, `src/utils` and any package. `src/utils/slug.ts` reaches its own
module's files alone, so an import of `src/lib/format.ts` there is a
[`dependency-direction`](../src/builtins/dependency-direction/README.md) finding. See [config.md](config.md#reach).

### Exposes and surface

What a module offers the modules that use it is its **surface**, and the module's `exposes` sets it. Every module in
the example exposes all its files. With `exposes: { files: [client.ts] }`, `db` would offer `client.ts` alone, and an
import of any other `db` file from `api` would be a finding. A file's TypeScript `export`s leave the surface as the
config sets it.

### Entry

A folder module's one way in, declared with `entry: index.ts` in place of `exposes`. The entry belongs to the folder
module itself, and it may re-export what the module's own modules expose.

### Barrel

A file whose job is to re-export others, such as an entry. An import is judged on the file its specifier names, so a
barrel on a surface lets its importers through to the files behind it.

### Requires

How an archetype reaches outside itself: it names what it needs in `requires`, and each module that uses it binds
those names in its `dependencies`. See [config.md](config.md#archetypes).

## Tests

### Test module

A module of test code: test files and the drivers, fixtures and DSLs they share, declared under `test: { modules }`.
`(root):tests` holds `src/api/orders.test.ts`. A test module reaches what the module that declares it reaches, and
that module's own files. A test module with `dir` is a folder and may hold test modules of its own, so a folder of
shared helpers keeps its shape. Only test code may import it: a production file that does is a
[`dependency-direction`](../src/builtins/dependency-direction/README.md) finding. See [config.md](config.md#tests).

### Test surface

What a module offers tests outside it, declared with `test: { exposes }`. A component's DSL goes on its test surface,
so an end-to-end test may drive the component while its production surface stays production code. See
[config.md](config.md#tests).

### Test kit

What every test module inside a module may import, declared with `test: { provides }`. The root's kit is `vitest`,
so every test may import it, and a module deeper down adds to what it inherits.

## Checking

### Rule

A check that returns findings. [rules.md](rules.md) lists the built-in rules, and a project adds its own as
[custom rules](custom-rules.md). Rules read facts, never source: what analysis extracts once from each file.

### Ruleset

Which rules judge a place and everything inside it, and how strictly. The root's ruleset runs every built-in rule with
its defaults, and its test block's ruleset turns `function-cohesion` off for the tests. See
[config.md](config.md#rulesets).

### Finding

One thing a rule reports, at a file and line:

```text
src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (root.utils src/utils) imports src/lib/format.ts (root.lib src/lib), which is outside utils's reach. Add lib to root.utils.dependencies (warp.yaml:4), or move the code.
```

Its **key**, `dependency-direction:src/utils/slug.ts->src/lib/format.ts`, identifies it across commits, and its
**value**, here the number of names imported, measures it. [rules.md](rules.md#findings) lists every field.

### Diff and baseline

`warp diff` reports the findings a change made **new** (a key the base lacks) or **worse** (a higher value). The
findings already there are the **baseline**, and `diff` leaves them out. See [diff.md](diff.md).
