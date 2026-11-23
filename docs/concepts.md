# Concepts

**Audience:** anyone reading warp's findings or writing a rule for it, people and agents alike.
**Purpose:** what each of warp's terms means, shown on one small project.

Each term gets one line and an example from the project below. The linked pages hold the detail.

## The example

```ts
// warp.config.ts
import { all, archetype, contains, defineConfig, dir, exposes, files, pkg, ruleset, using } from 'warp';

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ strings: dir() })
  .contains((m, { required, self }) =>
    m
      .module('subcomponent', dir('{name}'), self)
      .module('logic', files('*.ts'), exposes(all()))
      .module('dom', files('{name}.dom.ts'), exposes(all()).using((m) => [m.logic, m.subcomponent.render, required.strings])),
  )
  .exposes((m) => ({ render: m.dom }))
  .tests(contains((t) => t.module('driver', files('*.driver.ts'))).exposes((t) => ({ driver: t.driver })));

const app = archetype('app')
  .contains((m) =>
    m
      .module('domain', files('src/domain/**'), exposes(all()))
      .module('strings', dir('src/strings'), exposes(all()))
      .module('components', dir('src/ui/{name}'), component.using((m) => [m.domain]))
      .module('main', files('src/main.ts'), using((m) => [m.components.render, pkg('node:*')])),
  )
  .provides((m) => ({ strings: m.strings }))
  .tests(using([pkg('vitest')]));

const base = ruleset().on(component.modules.dom, { 'cognitive-complexity': { max: 10 } });

export default defineConfig({ root: app, tests: files('**/*.test.ts'), rulesets: { default: base } });
```

```
src/
├── domain/order.ts
├── strings/en.ts
├── ui/cart/
│   ├── cart.ts              imports domain/order.ts
│   ├── cart.dom.ts          imports cart.ts, strings/en.ts, badge/badge.dom.ts
│   ├── cart.test.ts         imports cart.ts, cart.driver.ts, vitest
│   ├── cart.driver.ts       imports cart.dom.ts
│   └── badge/badge.dom.ts
├── main.ts                  imports ui/cart/cart.dom.ts and ui/cart/cart.ts
└── stray.ts
```

`warp model` reads it as:

```
.  root: app
  loose: src/stray.ts
  .:domain  1 file
  src/strings  strings: app.strings, 1 file
  src/ui/cart  components: component {name=cart}, 1 test
    src/ui/cart/badge  subcomponent: component {name=badge}
      src/ui/cart/badge:dom  1 file
    src/ui/cart:logic  1 file
    src/ui/cart:dom  1 file
    src/ui/cart:tests.driver  1 file
  .:main  1 file

10 modules, 8 files, 1 test, 1 loose.
```

## Structure

**Config.** The default export of `warp.config.ts`: the codebase's structure, its rulesets and its plugins. The
example's config is everything above the file tree. See [config.md](config.md).

**Archetype.** A reusable module type: how its folders are found, the modules they hold, and what they expose,
require and provide. `component` and `app` are archetypes.

**Module.** A boundary warp checks imports across, declared with `.module(name, selector, archetype?)`. Every file
belongs to at most one module.

- A **folder module** comes from a `dir(...)` selector, one per folder it matches, and is named by its path:
  `src/ui/cart` (a `component`) and `src/strings`. The root module is the config's folder (`.`, an `app`).
- A **files module** comes from a `files(...)` selector, some of its folder module's files by pattern, and is named
  `folder:name`: `cart.ts` is in `src/ui/cart:logic` and `cart.dom.ts` in `src/ui/cart:dom`, because the more
  specific pattern wins.
- A module with no named archetype, such as `strings`, gets one of its own (`app.strings`). `using()`, `exposes()`
  and `archetype()` start one when it needs wiring. A folder module with no modules of its own owns all its files.

**Captures.** A `{name}` placeholder in a dir path matches one folder name, and the archetype's own patterns can use
it: for `src/ui/cart`, `{name}` is `cart`, so its `dom` module is `cart.dom.ts`.

**Identify.** Which matching folders count as modules: a **marker** file that must exist (`{name}.dom.ts`), or a
`match` function. `src/ui/cart` has `cart.dom.ts`, so it is a component; a folder without one is not.

**Self.** The archetype being defined, so it can nest in itself: `subcomponent` finds `src/ui/cart/badge`, another
`component`.

**Loose file.** A folder module's file that none of its files modules matches. `src/stray.ts` is loose, and
[`unclassified`](../src/builtins/unclassified/README.md) reports it.

**Model.** The modules and files warp resolves from the config and the file system, before any rule runs.
`warp model` prints it, as above.

## What a file may import

**Using.** The list of what a module's files may import, and the only permission there is. `dom` uses
`[m.logic, m.subcomponent.render, required.strings]`, so `cart.dom.ts` may import `cart.ts`, `badge.dom.ts` and
`en.ts`. `m.x` names a module declared above; a module sees only those. `component.using(...)` wires a named
archetype at one place: `components` uses `m.domain`.

**Package.** A `pkg()` entry in a `using`, for imports of npm or Node packages: `pkg('node:*')` would let `main.ts` import
`node:fs`. An import of a package outside its reach is a
[`module-externals`](../src/builtins/module-externals/README.md) finding.

**Reach.** Everything one file may import: the rest of its module, what its module's `using` names, and, in a files
module, what its folder module's `using` names. `cart.ts` reaches `src/domain` through `components`' `using`. See
[config.md](config.md#reach).

**Exposes and surface.** What a module offers the modules that use it. A module exposes nothing until it says so:
`exposes(all())` opens its files and what its modules expose, `exposes(files('ports/*.ts'))` some of them, and
`.exposes((m) => ({ render: m.dom }))` named **surfaces**. `component` exposes `render` (its `dom` files), so
`main.ts` may import `cart.dom.ts`, and `cart.ts` is private to its module. Using a module that exposes nothing is a
config error.

**Entry.** A folder module's one way in, declared with `.entry(files('index.ts'))` in place of `exposes`. The entry
belongs to the folder module itself, even when the module holds other modules, and it is the module's whole surface.
It may re-export what the module's own modules expose: a package's `src/index.ts` is the entry of a `src` module. See
[config.md](config.md#reach).

**Requires and provides.** A module that needs something from above names it in `.requires()`, and the nearest
ancestor that `.provides()` it supplies it. `component` requires `strings`, and `app` provides its `strings` module, so
`required.strings` in `dom` reaches `src/strings` at any depth. See
[config.md](config.md#requires-provides-identify-and-self).

## Tests

**Test file.** A file the config's `tests:` globs match: `cart.test.ts`. It belongs to the folder module that holds it,
`src/ui/cart`, never to a files module inside it, and sees all of that module's files. Nothing in production may
import it.

**Test layer.** What an archetype adds for its tests with `.tests()`: test modules, a `using` and test surfaces.
`app`'s layer uses `vitest`, which reaches every test below it. See [config.md](config.md#tests).

**Test module.** Test support declared in a layer, such as `component`'s `driver`: `cart.driver.ts` is in
`src/ui/cart:tests.driver`. Its tests see it, and what the layer exposes, here `driver`, reaches the tests of the
modules above with no `using`.

**Locator.** Where a module's tests live when not beside its code: `.tests(dir('e2e'), ...)` makes every file in
`e2e/` the root's test support, and the ones `tests:` matches its entries.

## Checking

**Facts.** What analysis extracts from each file once, and the only thing a rule reads; no rule reads source. A
file's facts (`FileFacts`) hold its imports, package imports, top-level members and functions:

- an **edge** (`ImportEdge`) is one import between two files, resolved through the specifier: `main.ts` →
  `src/ui/cart/cart.ts`, names `['cartTotal']`. It records whether it is type-only or a re-export, and `via` when
  it went through a barrel.
- a **member** is a top-level declaration, such as `cartTotal`, and the member graph links members that use each
  other. The cohesion rules read it.
- a function's facts hold its statements and its complexity.

**Facts cache.** The facts from the last run, kept under `.git/warp-cache/`, so a run after an edit analyses only the
edited files and their importers. See [agents-and-ci.md](agents-and-ci.md#facts-cache).

**Rule.** A check over facts that returns findings. A **file rule** reads one file's facts at a time, with the
options set for that file; `cognitive-complexity` is one. A **project rule** (`scope: 'project'`) reads every file
once, with the model and the verdicts; `dependency-direction` is one. A **plugin** adds a project's own rules under a
namespace, such as `wt/no-ports-through-application`. See [config.md](config.md#custom-rules).

**Verdict.** The model's decision on one edge: allowed, with the **grant** that allows it, or refused, with the
reason. `main.ts` → `cart.ts` is refused as `private`, hidden by `src/ui/cart`; `cart.dom.ts` → `en.ts` is allowed,
granted by `dom` using `required.strings`.

**Finding.** One thing a rule reports, at a file and line:

```
src/main.ts:2 [dependency-direction] src/main.ts (main of app .) imports src/ui/cart/cart.ts (logic of component src/ui/cart), which src/ui/cart keeps private (it exposes render). ...
```

Its **key**, `dependency-direction:src/main.ts->src/ui/cart/cart.ts`, identifies it across commits, and its
**value**, here the number of names imported, is what `diff` compares. It also carries a `message`, `details` an
agent can act on, and a `docs` link to the rule's page.

**Ruleset.** Which rules judge each place, and how strictly, apart from the structure. `base` sets
`cognitive-complexity` to `max: 10` on every component's `dom` module (`component.modules.dom`), and every other rule runs with its defaults.
See [config.md](config.md#rulesets).

**Diff.** The findings a change made **new** (a key the base lacks) or **worse** (a higher value), against a base
commit or the last run. The findings already there are the **baseline**, and `diff` leaves them out. See
[agents-and-ci.md](agents-and-ci.md#diff).
