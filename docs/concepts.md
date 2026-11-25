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
└── index.ts            re-exports api/orders.ts
```

```ts
// warp.config.ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

const app = archetype('app')
  .contains((c) =>
    c
      .module('lib', dir('src/lib'), exposes(all()))
      .module('utils', dir('src/utils'), exposes(all()))
      .module('db', dir('src/db'), exposes(all()))
      .module('api', dir('src/api'), exposes(all()).using((m) => [m.db, m.lib, m.utils, pkg('*')]))
      .testModule('tests', files('src/**/*.test.ts')),
  )
  .entry(files('src/index.ts'))
  .testUsing([pkg('vitest')]);

const base = ruleset().on(app.modules.tests, { 'function-cohesion': false });

export default defineConfig({ root: app, rulesets: { default: base } });
```

`warp model` reads it as:

```text
(root)  root: app, 1 file
  src/lib  lib: app.lib, 1 file
  src/utils  utils: app.utils, 1 file
  src/db  db: app.db, 1 file
  src/api  api: app.api, 1 file
  (root):tests  1 test file

6 modules, 5 files, 1 test file, 0 loose.
```

## Structure

### Config

The default export of `warp.config.ts`: the codebase's modules, what each may use, and the rulesets that judge them.

### Module

A boundary warp checks imports across, declared with `.module(name, selector, archetype?)`. Every file belongs to at
most one module.

- A **folder module** comes from `dir(...)`, one per folder that matches, and is named by its folder: `src/api`. The
  **root module** is the config's folder, `(root)`.
- A **files module** comes from `files(...)`: some of its folder module's files, by pattern, named `folder:name`. A
  `generated` module of `files('**/*.gen.ts')` inside `src/api` would be `src/api:generated`.
- A **test module** comes from `.testModule(...)` and holds test code. See [Test module](#test-module).

### Archetype

A module's shape: the modules it holds, what it uses and what it exposes. `app` is the root's archetype. A named
archetype, `archetype('layer')`, can shape many folders, and `exposes(all())` starts an unnamed one for a single
module, shown as `app.lib`.

### Loose file

A file in a folder module that none of its files modules matches. Before `lib` had a module, `src/lib/format.ts` was
loose, and [`unclassified`](../src/builtins/unclassified/README.md) reported it.

### Model

The modules and files warp resolves from the config and the file system, before any rule runs. `warp model` prints
it, as above.

## What a file may import

### Using

What a module's files may import, and the only permission there is. `api` uses `[m.db, m.lib, m.utils, pkg('*')]`.
`m` holds the modules declared above, so `lib`, declared first, can use none of the others.

### Package

A `pkg()` entry in a `using`, for imports of npm or Node packages. `pkg('*')` lets `api` import any package, and
`pkg('zod')` only zod. A package import outside the importer's reach is a
[`module-externals`](../src/builtins/module-externals/README.md) finding.

### Reach

Everything one file may import: the rest of its module, and what its module's `using` names. `src/api/orders.ts`
reaches `src/db`, `src/lib`, `src/utils` and any package. `src/utils/slug.ts` reaches its own module's files alone,
so an import of `src/lib/format.ts` there is a [`dependency-direction`](../src/builtins/dependency-direction/README.md)
finding. See [config.md](config.md#reach).

### Exposes and surface

What a module offers the modules that use it is its **surface**, and the module's `exposes` sets it. Every module in
the example exposes all its files. With `exposes(files('client.ts'))`, `db` would offer `client.ts` alone, and an
import of any other `db` file from `api` would be a finding. A file's TypeScript `export`s leave the surface as the
config sets it.

### Entry

A folder module's one way in, declared with `.entry(files('index.ts'))` in place of `exposes`. The entry belongs to
the folder module itself, and it may re-export what the module's own modules expose: `src/index.ts` is the root's
entry and re-exports `api`.

### Barrel

A file whose job is to re-export others, such as `src/index.ts`. An import is judged on the file its specifier names,
so a barrel on a surface lets its importers through to the files behind it.

### Requires and provides

How an archetype reaches modules above it: it names what it needs in `.requires()`, and the nearest ancestor that
`.provides()` it supplies it. See [config.md](config.md#requires-provides-identify-and-self).

## Tests

### Test module

A module of test code: test files and the drivers, fixtures and DSLs they share, declared with
`.testModule(name, selector)` in `.contains()`. `(root):tests` holds `src/api/orders.test.ts`. A test module reaches
what the module that declares it reaches, and that module's own files. Only test code may import it: a production
file that does is a [`dependency-direction`](../src/builtins/dependency-direction/README.md) finding. See
[config.md](config.md#tests).

### Test surface

What a module offers tests outside it, declared with `.testExposes(...)` beside its `exposes`. A component's DSL goes
on its test surface, so an end-to-end test may drive the component while its production surface stays production
code. See [config.md](config.md#tests).

### Test kit

What every test module at and below an archetype's modules may import, declared with `.testUsing(...)`. `app`'s kit is
`vitest`, so every test may import it, and a module deeper down adds to what it inherits.

## Checking

### Rule

A check that returns findings. [rules.md](rules.md) lists the built-in rules, and a project adds its own as
[custom rules](custom-rules.md). Rules read facts, never source: what analysis extracts once from each file.

### Ruleset

Which rules judge each place, and how strictly. `base` turns `function-cohesion` off for the tests, and every other
rule runs with its defaults. See [config.md](config.md#rulesets).

### Finding

One thing a rule reports, at a file and line:

```text
src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (app.utils src/utils) imports src/lib/format.ts (app.lib src/lib), which is outside utils's reach. Add m.lib to the using of app.utils, or move the code.
```

Its **key**, `dependency-direction:src/utils/slug.ts->src/lib/format.ts`, identifies it across commits, and its
**value**, here the number of names imported, measures it. [rules.md](rules.md#findings) lists every field.

### Diff and baseline

`warp diff` reports the findings a change made **new** (a key the base lacks) or **worse** (a higher value). The
findings already there are the **baseline**, and `diff` leaves them out. See [diff.md](diff.md).
