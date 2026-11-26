# Config

**Audience:** anyone writing or changing a warp config.
**Purpose:** every part of the config language: its keys, modules, names, archetypes, reach, tests and rulesets.

The config is a `warp.yaml` next to the project's tsconfig. It declares the modules of the codebase, which files each
owns, what each may import and what each offers, and its rulesets say which rules judge each module, and how
strictly. [concepts.md](concepts.md) defines its terms, and [`warp.yaml`](../warp.yaml) is the config warp checks
itself with.

```yaml
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    application: { dir: src/app, dependencies: [domain], exposes: all }
    adapters: { dir: src/adapters, dependencies: [domain, application, 'npm:*'] }

rulesets:
  default:
    extends: [warp:recommended]
    rules: { cognitive-complexity: { max: 15 } }
    on: { root.adapters: { file-cohesion: { maxLines: 300 } } }
```

The top level takes these keys:

| Key | Takes | Default |
| --- | --- | --- |
| `root` | the repository: the module of the config's folder | required |
| `archetypes` | archetypes by name, see [Archetypes](#archetypes) | none |
| `rulesets` | rulesets by name, see [Rulesets](#rulesets) | none, so no rule runs |
| `plugins` | custom rules' files by namespace, see [custom-rules.md](custom-rules.md) | none |
| `tsconfig` | a path, or a list of paths, relative to the config | `tsconfig.json` |

The file is YAML 1.2. Anchors, aliases and merge keys are refused: write each part out. Unknown keys, names, rules
and options are refused too, so a misspelling fails loudly. The config holds no code, and warp runs only the plugins
it names; [SECURITY.md](../SECURITY.md) says what that means.

## Modules

Every boundary the config declares is a module, a key under some `modules:`. A module takes these keys:

| Key | Takes |
| --- | --- |
| `description` | what it is for, as a note for whoever reads the config |
| `dir` or `files` | the folder it owns, or the files: a pattern or a list of them |
| `archetype` | the [archetype](#archetypes) that defines what is inside it |
| `dependencies` | what its files may import, see [Names](#names) |
| `exposes` | what other modules may import from it: `all`, a list of its own modules, or `{ files: [...] }` |
| `entry` | its one way in, in place of `exposes`: a file pattern |
| `modules` | the modules inside it, on a `dir` module only: a folder holds modules, a list of files doesn't |
| `test` | its test code, see [Tests](#tests) |

```yaml
root:
  modules:
    domain:
      description: The model of an order
      dir: src/domain
      exposes: { files: [order.ts] }
    adapters:
      dir: src/adapters
      dependencies: [domain, npm:zod]
      exposes: { files: [index.ts] }
      modules:
        db: { dir: db, dependencies: [domain] }
    main: { files: src/main.ts, dependencies: [adapters] }
```

- `dir` owns a folder and everything below it that no deeper module claims. `files` owns the files its patterns
  match in its folder. In a pattern `*` stays in one folder, `**` crosses folders, and the rest is literal. Patterns
  are relative to the module they are written in.
- When modules overlap, the most specific claims: the deepest `dir`, then the `files` pattern with the longest fixed
  ending after its last `*` (`*.dom.ts` beats `*.ts`), with `**` last. A tie fails to load and names both modules.
- A file belongs to its deepest folder module, then to the files module there that matches it. A file no module
  matches is loose, and `check` and `diff` report it as [`unclassified`](../src/builtins/unclassified/README.md).
- Each module names its own `dependencies`: nothing passes down from the module that holds it. `db` above names
  `domain` itself.
- [`warp model`](cli.md) shows how warp reads the config. A folder module's id is its folder (`(root)` for the root),
  and a files module's is its folder and name, `(root):main`.
- warp reads every file of the programs its `tsconfig` files make, except declaration files. For a solution-style
  tsconfig, list each project config: `tsconfig: [tsconfig.app.json, tsconfig.node.json]`.

## Names

```yaml fragment
dependencies: [domain, ports.store, top.adapters, npm:zod, 'npm:@aws-sdk/*', 'node:*', 'virtual:pwa-register']
```

- A bare name is a sibling in the same `modules:`, then a module above it inside the same archetype or root, then
  one of the archetype's inputs.
- A dotted name is a module and one of its surfaces (`ports.store`), or with `top.` a module at the top of the
  archetype or root it is written in.
- `npm:x` is a package and its subpaths, `node:x` a Node built-in, `virtual:x` a bundler's virtual module. `*` in a
  package matches any run of characters: `'npm:*'`, `'node:*'`, `'npm:@aws-sdk/*'`. Quote an entry that starts with
  `*` or holds `: `.
- A name that is not in scope fails to load, and lists what is.

```yaml
root:
  modules:
    core: { dir: src/core, exposes: all }
    feat:
      dir: src/feat
      modules:
        core: { dir: core, exposes: all }
        api: { dir: api, dependencies: [core] }
        jobs: { dir: jobs, dependencies: [top.core] }
```

`api` reaches `src/feat/core`, the nearest `core`, and `jobs` reaches `src/core`. Inside an archetype, `top.` is the
top of the archetype, never the root: a module outside the archetype comes in through its `requires`.

## Archetypes

An archetype is a module defined on its own, behind a declared interface: what it requires and what it exposes. Use
one when its inside deserves to be read on its own, or when the same kind of module repeats. Name it for what it is,
not for its folder layout.

```yaml
root:
  modules:
    strings: { dir: src/strings, exposes: all }
    components: { dir: 'src/ui/*', archetype: component, dependencies: [strings] }

archetypes:
  component:
    marker: '{name}.dom.ts'
    requires: [strings]
    exposes: [render]
    modules:
      subcomponent: { dir: '*', archetype: component, dependencies: [strings] }
      logic: { files: '*.ts', dependencies: [strings], exposes: all }
      render: { files: '{name}.dom.ts', dependencies: [logic, subcomponent.render], exposes: all }
```

```text
src/ui/cart/cart.ts              src/ui/cart:logic
src/ui/cart/cart.dom.ts          src/ui/cart:render
src/ui/cart/badge/badge.dom.ts   src/ui/cart/badge:render, a component inside cart
```

An archetype takes a module's keys except `dir`, `files`, `archetype` and `dependencies`, plus these:

| Key | Takes |
| --- | --- |
| `marker` | a file that marks a folder as one of its instances, such as `'{name}.dom.ts'` |
| `requires` | the names it needs from where it is used: a name or a list of them |

- The module that uses an archetype gives `dir` and `archetype`, and its `dependencies` fill the archetype's
  `requires`, each by the entry's name. To bind a name to something called otherwise, use a map:
  `dependencies: { strings: copy, zod: npm:zod }`. An archetype reaches outside itself only through `requires`.
- Each module inside takes only what its own `dependencies` name. A require no module names fails to load, and so
  does a use of the archetype that leaves one unbound.
- `dir: '*'` with an archetype makes each matching folder its own instance. Inside the archetype, `{name}` is that
  folder's name: `files: '{name}.dom.ts'` in `cart/` means `cart.dom.ts`.
- With a `marker`, `dir` matches only folders that hold it: `dir: 'src/ui/*'` above takes `cart/`, which holds
  `cart.dom.ts`, and leaves `src/ui/icons/`, which holds no `icons.dom.ts`. The marker can be a file outside the
  program, such as `component.json`.
- An archetype may use itself: `subcomponent` finds `cart/badge`, another component, and passes `strings` on.
- A module with `modules:` and no `archetype` is an archetype of its own, written in place. warp names it by its
  path, `root.adapters`.

## Reach

`check` and `diff` judge every import between project files against the importer's reach, and report each one
outside it as [`dependency-direction`](../src/builtins/dependency-direction/README.md):

- A file reaches the rest of its own module, and what its module's `dependencies` name.
- A module's surface is what it exposes, and is empty until it says. `exposes: all` opens its own files and what its
  modules expose, `exposes: { files: ['ports/*.ts'] }` some of those, and `exposes: [render]` named surfaces, one
  per module listed. Naming the module reaches all its surfaces, and `ui.render` one of them. Naming a module that
  exposes nothing fails to load.
- The surface is set by the config, separately from TypeScript's `export`. With `exposes: { files: [index.ts] }`,
  `order.ts` can export anything, and another module's import of it is still a finding.
- `entry: index.ts` gives a folder module one way in, in place of `exposes`. The entry belongs to the folder module
  itself, ahead of any files module that matches it, and it is the module's whole surface. It reaches what the
  module's own modules expose, so it can re-export them.
- An import is judged on the file its specifier names, so a barrel on a surface lets importers through to the files
  behind it. Type-only imports count.

```yaml
root:
  modules:
    lib: { dir: src, archetype: lib }
    scripts: { files: 'scripts/*.ts', dependencies: [lib] }

archetypes:
  lib:
    entry: index.ts
    modules:
      core: { dir: core, exposes: all }
      cli: { files: cli.ts, dependencies: [core] }
```

```text
src/index.ts       src, the entry: re-exports src/core, and is all that scripts/*.ts reach through lib
src/cli.ts         src:cli
src/core/order.ts  src/core, reached from outside src only through index.ts
```

A package import is judged against the packages in the file's reach, and one outside it is reported as
[`module-externals`](../src/builtins/module-externals/README.md). A bare specifier that resolves to no project file
is a package import. Its package is the specifier's first segment, or two for a scoped package, so
`@aws-sdk/client-s3/commands` is `npm:@aws-sdk/client-s3`. A Node built-in is `node:` and its name, so `fs/promises`
is `node:fs`.

## Tests

Each module, archetype and the root has one `test:` block, the test-side twin of its production keys:

| Key | Takes |
| --- | --- |
| `modules` | its test modules: test files and the drivers, fixtures and DSLs they share |
| `provides` | what every test module inside it may import, unasked: its test kit |
| `exposes` | what test code outside may import from it; production code never sees it |
| `requires` | on an archetype, inputs only its tests need |
| `dependencies` | on a use of an archetype, what fills its `test.requires` |

```yaml
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    pages: { dir: 'src/*', archetype: page, dependencies: [domain] }
  test:
    provides: [fixtures.seeds, npm:vitest]
    modules:
      fixtures:
        dir: src/test-helpers
        dependencies: [domain]
        exposes: [seeds]
        modules:
          builders: { files: '*.builder.ts' }
          seeds: { files: '*.seed.ts', dependencies: [builders] }
      e2e:
        dir: e2e
        dependencies: [pages.driver]
        modules:
          journeys: { files: '*.dsl.ts', dependencies: [pages.render, pages.driver] }

archetypes:
  page:
    marker: '{name}.dom.ts'
    requires: [domain]
    exposes: [render]
    modules:
      logic: { files: '*.ts', dependencies: [domain], exposes: all }
      render: { files: '{name}.dom.ts', dependencies: [logic], exposes: all }
    test:
      exposes: [driver]
      modules:
        driver: { files: '*.driver.ts' }
        tests: { files: '*.test.ts', dependencies: [driver] }
```

```text
src/cart/cart.ts                   src/cart:logic
src/cart/cart.driver.ts            src/cart:driver
src/cart/cart.test.ts              src/cart:tests              reaches logic, render, the driver, the seeds and vitest
src/test-helpers/order.seed.ts     src/test-helpers:seeds      reaches the builders, domain and vitest
e2e/checkout.dsl.ts                e2e:journeys                reaches each page's render and driver, the seeds and vitest
e2e/checkout.test.ts               e2e                         reaches the journeys and what they reach
```

- A test module reaches its own files, every file of the module that declares it, what that module reaches, what
  every module above it provides, and what its own `dependencies` name. `cart.test.ts` reaches `logic` and `render`
  because they are `src/cart`'s.
- `provides` reaches every test module inside, through nested archetypes too, except a test module's own folder:
  `fixtures.seeds` gives `builders` nothing, and `seeds` reaches `builders` because it names it.
- A test module with `dir` is a folder of test code, and may hold test modules of its own; it may use an archetype,
  which then holds test code only. A test module exposes all its files unless it says otherwise.
- Tests that share a helpers folder are two test modules side by side, the tests naming the helpers:

  ```yaml fragment
  test:
    modules:
      helpers: { dir: test-helpers }
      tests: { files: '*.test.ts', dependencies: [helpers] }
  ```
- Only test code reaches a test module: through a test module's `dependencies`, a `provides`, or a test surface.
  Naming a test module in production `dependencies` or `exposes` fails to load, and a production file that imports
  one is a [`dependency-direction`](../src/builtins/dependency-direction/README.md) finding.
- A test surface passes up one module at a time. Had `pages` sat inside a `ui` module, `ui` would pass the drivers on
  with `test: { exposes: [pages.driver] }`, since `exposes: all` carries production files alone.
- A test module's `files` claim ahead of any production module. Where several match, the deepest module's wins, then
  the more specific pattern, as for files modules. A `dir` test module's folder is its own, so `journeys` sits inside
  `e2e` rather than beside it.
- A file is test code only when a test module claims it. A test file nothing claims is production code of its module,
  or loose and reported by [`unclassified`](../src/builtins/unclassified/README.md).
- [`module-cycle`](../src/builtins/module-cycle/README.md) leaves test modules' imports out.

## Rulesets

No rule runs until a ruleset extends `warp:recommended`, which runs every rule with its defaults, and
[`unclassified`](../src/builtins/unclassified/README.md) at the root. A ruleset sets rules at three levels: `rules`
for the whole config, `test` for every test module, and `on` for an archetype, or a module by its path from an
archetype or the root, `root.adapters` or `layer.tests`. The ruleset named `default` applies when the command names
none.

```yaml
root:
  modules:
    domain: { dir: src/domain, archetype: layer }
    adapters: { dir: src/adapters, archetype: layer }
    generated: { dir: src/generated }

archetypes:
  layer:
    exposes: all
    modules:
      src: { files: '**', exposes: all }
    test:
      provides: [npm:vitest]
      modules:
        tests: { files: '**/*.test.ts' }

rulesets:
  default:
    extends: [warp:recommended]
    rules: { cognitive-complexity: { max: 15 } }
    test: { function-cohesion: off }
    on: { root.generated: off }
  edit:
    extends: [default]
    rules: { cognitive-complexity: { max: 12 } }
    on: { root.adapters: { file-cohesion: { maxLines: 300 } } }
```

```sh
warp diff HEAD --ruleset edit
warp model --ruleset edit --rules   # what each module changes
```

- Settings are `on`, `off` or options by rule id, or `off` for every rule at that place. `'*': off` turns every rule
  off there while the rules listed beside it stay on. Plugin rules are `namespace/id`.
- `extends` puts its bases first, in order, so a ruleset changes only what differs. A later setting merges into an
  earlier one at the same place: options into options, `off` off, and `on` on with the options kept.
- An archetype's setting reaches every module of that archetype, and a module's every instance of it. `test` sets
  each test module as `on` would. For a finding on a file, the nearest place wins: the file's module, then that
  module's archetype, then the same for each module above it, then `rules`. Options merge nearest first.
- `diff` checks both sides with the same ruleset, so a delta comes from the code alone. An unknown name fails and
  lists the rulesets there are.

## Plugins

```yaml
plugins:
  wt: ./rules/index.ts
  shared: npm:@acme/warp-rules

root:
  modules:
    src: { files: '**' }

rulesets:
  default:
    extends: [warp:recommended]
    on: { root.src: { wt/no-ports-through-application: on } }
```

Custom rules are code, loaded from the path or package each namespace names. [custom-rules.md](custom-rules.md)
covers writing one.
