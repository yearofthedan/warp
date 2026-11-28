# Config

**Audience:** anyone writing or changing a warp config.
**Purpose:** every part of the config language: its keys, modules, names, archetypes, reach, tests and rulesets.

The config is a `warp.yaml` next to the project's tsconfig. It declares the modules of the codebase, which files each
owns, what each may import and what each offers, and the rulesets on its modules say which rules judge each one, and
how strictly. [concepts.md](concepts.md) defines its terms, and [`warp.yaml`](../warp.yaml) is the config warp checks
itself with.

Every permission is written down: a module may import only what its config names, and offers only what it exposes.
When describing a project takes exceptions, long allow lists or path tricks, the structure being described is usually
tangled too, and the fix is usually in the code rather than the config.

```yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
    rules: { cognitive-complexity: { max: 15 } }
  modules:
    domain: { dir: src/domain, exposes: all }
    application: { dir: src/app, dependencies: [domain], exposes: all }
    adapters:
      dir: src/adapters
      dependencies: [domain, application, 'npm:*']
      ruleset: { rules: { file-cohesion: { maxLines: 300 } } }
```

The top level takes these keys:

| Key | Takes | Default |
| --- | --- | --- |
| `root` | the repository: the module of the config's folder | required |
| `archetypes` | archetypes by name, see [Archetypes](#archetypes) | none |
| `rulesets` | named rulesets that other rulesets extend, see [Rulesets](#rulesets) | none |
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
| `ruleset` | the rules for it and everything inside it, see [Rulesets](#rulesets) |

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
- A file belongs to its deepest folder module, then to the files module there that matches it. A file in a folder
  module that has modules, which none of them matches, is loose. A folder module's entry is never loose.
  [`unclassified`](../src/builtins/unclassified/README.md) reports loose files, and `warp model` lists them.
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
  one of the archetype's inputs. A module named like an input shadows it, and fails to load.
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
| `ruleset` | the rules for its test code, see [Rulesets](#rulesets) |

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

A ruleset turns rules on or off and sets their options. No rule runs until a ruleset turns it on. A ruleset is
written where it applies: `ruleset:` on the root, a module or an archetype, and `ruleset:` in a `test:` block for test
code. It reaches everything inside that place, and each place inside adds its own on top, as nested ESLint configs do.

warp's own rulesets come in two kinds. Three turn on each class of built-in rule with its defaults, as
[rules.md](rules.md) groups them, and a project usually starts from all three on the root:

| Ruleset | Turns on the rules that check |
| --- | --- |
| `warp:boundaries` | that the module graph is the declared one: reach, cycles, loose files, unused declarations and exports. |
| `warp:cohesion` | that each function, class, file and module holds one idea. |
| `warp:coupling` | how many connections each module makes to and from others. |

The other three go on a place whose job makes some of those rules misfire, and turn them off there:

| Ruleset | Goes on | Turns off |
| --- | --- | --- |
| `warp:toolkit` | A module of independent helpers meant to be used everywhere, such as `strings`. | `export-consumers`, `export-surface`, `file-cohesion` |
| `warp:wiring` | A composition root, which imports from every area to put them together. | `module-dependencies`, `export-spread` |
| `warp:test` | A `test:` block. | `function-cohesion`, `cognitive-complexity` |

`warp:test` turns off the function measures because `describe` and `it` callbacks nest every test of a file inside
one outer function. `module-size` still bounds a module that takes `warp:toolkit`.

```yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
    rules: { cognitive-complexity: { max: 15 } }
  test:
    ruleset: [warp:test]
  modules:
    domain: { dir: src/domain, archetype: layer }
    adapters: { dir: src/adapters, archetype: layer, ruleset: [legacy] }
    generated: { dir: src/generated, ruleset: off }

archetypes:
  layer:
    ruleset: { rules: { file-cohesion: { maxLines: 200 } } }
    exposes: all
    modules:
      src: { files: '**', exposes: all }
    test:
      provides: [npm:vitest]
      modules:
        tests: { files: '**/*.test.ts', ruleset: { rules: { file-cohesion: { maxLines: 400 } } } }

rulesets:
  legacy:
    rules: { cognitive-complexity: { max: 25 }, file-cohesion: { maxLines: 500 } }
```

```text
src/domain/order.ts       every built-in rule, cognitive-complexity max 15, file-cohesion maxLines 200
src/adapters/db.ts        the same, then legacy: cognitive-complexity max 25, file-cohesion maxLines 500
src/adapters/db.test.ts   as db.ts, then warp:test, then file-cohesion maxLines 400
src/generated/api.ts      no rules
```

- A ruleset takes `extends`, the rulesets it starts from in order, and `rules`, settings by rule id laid over them.
  `extends` names one of warp's rulesets, such as `warp:boundaries`, a plugin's ruleset as `namespace:name`, or a
  ruleset under the top-level `rulesets:`. A named ruleset applies only through an `extends`; one that nothing extends fails to load.
- A ruleset with no rules of its own is the list it extends: `ruleset: [warp:boundaries, warp:cohesion]` is
  `ruleset: { extends: [warp:boundaries, warp:cohesion] }`, here or under `rulesets:`. `ruleset: off` is
  `ruleset: { rules: off }`.
- Name a ruleset to give a set of presets one name, or to use the same settings in several places that don't
  share them through the tree:

```yaml
plugins:
  shared: npm:@acme/warp-rules

rulesets:
  lint-rules: [warp:boundaries, warp:cohesion, warp:coupling, shared:recommended]
  strict: { rules: { cognitive-complexity: { max: 8 }, file-cohesion: { maxLines: 150 } } }

root:
  ruleset: [lint-rules]
  modules:
    domain: { dir: src/domain, ruleset: [strict] }
    billing: { dir: src/billing, ruleset: [strict] }
    scripts: { dir: scripts }
```

- Settings are `on`, `off` or options by rule id, and options turn the rule on. `'*': off` turns off every rule the
  ruleset doesn't name, and `rules: off` is `'*': off`. A rule comes on only where it is named or a ruleset that
  names it is extended, so the config shows what runs. Plugin rules are `namespace/id`.
- An option that lists modules, such as `ignore` on [`export-spread`](../src/builtins/export-spread/README.md) and
  [`module-dependencies`](../src/builtins/module-dependencies/README.md), names
  them as `dependencies` do, from inside the place the ruleset is written: on a module with `modules:` or an
  archetype, its own modules and inputs first, then the names above; on any other module, its siblings and the
  names above. A named ruleset holds no module names, since it is written nowhere in the tree.
- For a file, warp lays the rulesets from the root down to the file's module. At each module it takes the
  archetype's ruleset, then the one where the module is written, so a use of an archetype adds to the archetype. A
  later setting decides whether a rule is on, and its options merge into the ones inherited.
- Nothing resets what a place inherits. `off` and `'*': off` are settings like any other, and a module further in
  turns a rule back on with the options it had:

```yaml
root:
  ruleset: { extends: [warp:boundaries, warp:cohesion, warp:coupling], rules: { file-cohesion: { maxLines: 200 } } }
  modules:
    legacy:
      dir: src/legacy
      ruleset: off
      modules:
        billing: { dir: billing, ruleset: { rules: { file-cohesion: on } } }
```

```text
src/legacy/old.ts           no rules
src/legacy/billing/pay.ts   file-cohesion alone, maxLines 200
```

- A test file takes every production ruleset from the root down to the module it tests, then every test block's
  `ruleset` from the root down to that module, then its test module's own. So `function-cohesion` stays off for
  `db.test.ts` above even if `adapters` turned it on: the root's test ruleset comes after every production one.
- `warp model --rules` shows what each module changes from the module above it, and `--json` every module's
  settings. With no ruleset anywhere, no rule runs, and `check` says so.

## Plugins

```yaml
plugins:
  wt: ./rules/index.ts
  shared: npm:@acme/warp-rules

root:
  ruleset: [warp:boundaries, warp:cohesion, warp:coupling, shared:recommended]
  modules:
    src: { files: '**', ruleset: { rules: { wt/no-ports-through-application: on } } }
```

Custom rules are code, loaded from the path or package each namespace names. A plugin's rules run only where a
ruleset turns them on, and a plugin can offer rulesets of its own, such as `shared:recommended`.
[custom-rules.md](custom-rules.md) covers writing one.
