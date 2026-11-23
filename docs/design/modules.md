# Design: modules

**Audience:** anyone implementing or reviewing the next change to warp's config language.
**Purpose:** the design for modules and the test layer, which change the model in [archetypes.md](archetypes.md).

Status: proposed, for review. Nothing here is built. Where this page and archetypes.md differ, this page is the
direction; archetypes.md is rewritten to match as each step lands.

## Summary

Three changes:

1. **Every declared boundary is a module.** `.module(name, selector, archetype | options)` replaces `.files` and
   `.dir`, and every module exposes nothing unless it says otherwise.
2. **Tests are a layer over the structure,** not parts inside it. A root pattern says which files are tests, each
   module owns the tests inside it, and production never imports test code.
3. **The rules follow the name:** `unit-cycle` becomes `module-cycle`, `unit-externals` becomes `module-externals`,
   `no-cross-unit-reexport` becomes `no-cross-module-reexport`, and `module-cohesion` becomes `file-cohesion`.

Core is structure: modules, selectors, `using`, `exposes`, requires and provides. Rulesets and tests are extensions
that refer to the core and nothing else. They ship in the same package for now.

## Modules

### Naming

The declared boundary is a **module**. "The graph module exposes render and uses application" is the sentence an
architect says, and the config should read the same way. Part and unit were two words for one idea: a part was a
boundary inside a unit, and a unit was a part that matched a folder. A module's scope is always visible in its
selector, so one word covers both.

The rule contract calls a file a module today (`ModuleRule`, `ModuleContext`, `ModuleFacts`). Those become file
names (`FileRule` and so on) in the same change, so the word has one meaning.

`module-cohesion` judges one file by LCOM4, so it becomes `file-cohesion`.

### Declaring a module

```ts fragment
.module(name, selector, archetype | options)
```

- **Selector** answers one question: which files. `files(...globs)` picks files; `dir(pattern)` picks folders, one
  module per match. A selector carries nothing else: no tests, no options.
- **Archetype** makes the module an instance of a named, reusable type.
- **Options** (`using`, `exposes`, `contains`, `tests`, `description`) make an anonymous archetype inline.
  Extracting one into a named archetype is a refactor, chosen the way a function is extracted: when it is reused or
  when the name helps.

`files()` and `dir()` already exist with no arguments as requirement shapes (`requires({ model: files() })`). They
keep that use.

### Every module is a boundary

`exposes` has one default: nothing. A module that others use says what they may reach:

- `exposes: 'all'` opens every file in the module.
- `exposes: files('check.ts', 'ports.ts')` opens those files.
- An archetype's `.exposes((s) => ({ render: s.dom }))` opens named surfaces, as today.

`using` a module that exposes nothing is a load error, so a forgotten `exposes` fails at load, not as a stream of
findings.

**Why one default:** a default derived from shape (files modules open, dir modules closed) makes one field decide
another's behaviour, and a reader has to know the rule to read the config. One default means every open boundary is
written down.

### Handles

An archetype's modules are reached as `component.modules.logic`, in ruleset targets and anywhere else a module is
named from outside. Builder methods (`exposes`, `tests`, `requires`) then never collide with a module name.
`tests` is the one reserved module name ([Test layer](#test-layer)).

## Tests

### Root test pattern

The root config names the test entry files, explicitly:

```ts fragment
export default defineConfig({ root: warp, tests: files('**/*.test.ts', 'do.test.ts') });
```

The pattern takes several globs, has no default, and does three jobs:

- **The colocated default.** Each module owns the matching files inside its selection as its tests. Those tests see
  the module's internals, whatever it exposes, and nothing imports them.
- **The production/test line.** Production code importing a test file, or a test module, is a finding.
- **Locators.** Inside a test location ([below](#locators)), the pattern says which files are entries; the rest are
  test support.

### Test layer

A module adds test support with `.tests(locator?, (t) => ...)` on an archetype, or the `tests:` option inline.
Inside, `t.module(...)` declares test modules with the same signature as production modules:

```ts fragment
.tests((t) => t
  .module('testPage', files('*.test-page.ts'), { using: (s) => [s.subcomponent.tests.testPage] })
  .exposes((s) => ({ testPage: s.testPage })))
```

- **What a test sees:** its module's internals, its module's test layer, the exposed test layers of the module's
  children (`s.sub.tests.testPage`), and its ancestors' test layers by lexical scope. Working title keeps
  test helpers at `src/`, `src/ui/` and inside components; each level's tests see the helpers above them with no
  requires or provides.
- **What a test layer exposes:** test-only surfaces, such as a child's test page or DSL that its parent's tests and
  e2e drive. They are reached through `tests` (`s.graph.tests.testPage`). That is noisier than a flat surface; no
  quieter shape has come up that keeps test surfaces out of production's reach.
- **Packages and anything outside lexical scope** go in the test layer's `using`, as for any module (assumption).

### Locators

The locator says where a module's tests live:

| Locator | Tests are |
| --- | --- |
| (none) | in the module's own folder, beside the code |
| `mirror('test')` | in a parallel tree, `test/` mirroring `src/` |
| `dir('e2e')`, `files(...)` | at that location, such as an e2e folder |
| a function | wherever the function maps the module's files to |

### Which module owns a test file

1. The nearest test pattern applies. A nested pattern replaces its parent's; patterns don't merge.
2. An explicit `.tests()` claim beats the pattern.
3. Otherwise the deepest module whose selection holds the file owns it.
4. Two sibling modules claiming the same file is a load error.

### Production edges only

`module-cycle` counts production edges. A test can't sit in a real cycle, since nothing imports it, and a test that
imports two modules that import each other reports their cycle once, through their own edges.

### Not generalised yet

Stories, benchmarks and generated code are also non-production layers. `.tests()` is generalised only when a real
case appears.

## Worked example

A component from working title, with its tests, and warp's own root. Both are sketches of the shape, not the
final API.

```ts fragment
const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ application: dir(), strings: dir(), icons: dir() })
  .contains((m, { required, self }) => m
    .module('subcomponent', dir('{name}'), self)
    .module('logic', files('*.ts'), { using: [required.application, required.strings], exposes: 'all' })
    .module('dom', files('{name}.dom.ts'), {
      using: (s) => [s.logic, s.subcomponent.render, required.application, required.icons, required.strings],
    }))
  .exposes((s) => ({ render: s.dom }))
  .tests((t) => t
    .module('dsl', files('*.dsl.ts'), { using: (s) => [s.subcomponent.tests.dsl] })
    .module('testPage', files('*.test-page.ts'), { using: (s) => [s.subcomponent.tests.testPage] })
    .exposes((s) => ({ dsl: s.dsl, testPage: s.testPage })));
```

The component's `*.test.ts` files need no declaration: the root pattern finds them, and they see `logic`, `dom`,
`dsl`, `testPage` and the test runner that working title's root declares in its own test layer. The old `test` part
listed eleven entries to say the same thing. This assumes the component owns those files, which is
[open](#open) question 3.

```ts fragment
const warp = archetype('warp')
  .contains((m) => m
    .module('model', dir('src/model'), { exposes: 'all' })
    .module('rules', dir('src/rules'), rules)
    .module('builtins', dir('src/builtins'), builtins)
    .module('app', dir('src/app'), {
      using: (s) => [s.rules, s.model, pkg('node:*')],
      exposes: files('check.ts', 'diff.ts', 'facts.ts', 'load.ts', 'ports.ts'),
    })
    .module('analysis', dir('src/analysis'), {
      using: (s) => [s.app, s.model, pkg('typescript')],
      exposes: files('typescript.ts', 'folders.ts'),
    })
    .module('api', files('src/index.ts'), { using: (s) => [s.app, s.rules, s.model], exposes: 'all' })
    .module('entry', files('src/cli.ts'), { using: (s) => [s.analysis, s.app, s.builtins, s.api] }))
  .exposes((s) => ({ api: s.api }))
  .tests(dir('e2e'));

export default defineConfig({ root: warp, tests: files('**/*.test.ts', 'do.test.ts') });
```

The three test parts in warp's config today (`unitTest`, `integrationTest`, `e2e`) go: each integration test
belongs to the module it sits in (`src/analysis/*.integration.test.ts` to `analysis`), and the root's tests are e2e.
`adapters` splits into `analysis`, `config` and `git`, because each is now its own boundary.

## Evidence

A simulation on the current model (files in the project's `warp-every-part-unit/` folder) treated every part as a
module and moved test parts into a scoped layer:

| | Working title (b126c5c) | warp |
| --- | --- | --- |
| `unit-cycle` | 22 → 0 | not measured |
| `dependency-direction` | 82 → 31: about 18 config gaps, 13 real | 4 new, all real |
| `exposes` added | 11 | 9 |
| archetypes with `.tests` | 4 | 3 |

Every working title cycle ran through test code, so counting production edges removes them all. The real reaches are tests
going into `card.ts`, sibling components and `app.ts` in working title, and a model test reaching into the built-in
rules' check in warp. Both are structure the old `test` parts hid.

## Dropped

- **A shorthand for "everything in my module"** (`s.$unit`). Tests see their module's internals by scope, which
  removes the long lists it was for.
- **The test runner as one surface** ([archetypes.md open question 3](archetypes.md#open)). The runner is a test
  module at the root, seen by every test below it, so no archetype requires it.

## Open

1. **The test layer's name.** `tests` is the working name and the reserved module name.
2. **The facade.** `src/index.ts` re-exports `app`, `rules` and `model`, so as its own module it fails
   `no-cross-module-reexport`. That rule has no `allow` by decision; the choice is between a carve-out for a
   package's public entry and a structure that needs none.
3. **Test files in a folder split into file modules.** In the component above, `logic`'s `*.ts` also matches
   `graph.test.ts`, so by depth `logic` owns the component's tests and they see only `logic`. Either file modules
   don't own tests by the pattern, or the component claims them with `.tests()`.
4. **Rollout order.** The rename, `.module` with closed `exposes`, and the test layer can land together or in turn.
   The test layer needs `.module` first; the rename can go at any point.
