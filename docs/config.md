# Config

**Audience:** anyone writing or changing a warp config.
**Purpose:** every part of the config: its keys, the builder, modules, reach, tests and rulesets.

The config is the default export of a `warp.config.ts` (or `.mts`, `.js`, `.mjs`) next to the project's tsconfig. Its
structure declares the modules of the codebase and what each module may use, and its rulesets say which rules judge
each module, and how strictly. [concepts.md](concepts.md) defines its terms, and
[`warp.config.ts`](../warp.config.ts) is the config warp checks itself with. warp runs the config as code, as you;
[SECURITY.md](../SECURITY.md) says what that means for running warp.

```ts
import { all, archetype, defineConfig, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

const open = exposes(all());

const app = archetype('app').contains((c) =>
  c
    .module('domain', files('src/domain/**'), open)
    .module('application', files('src/app/**'), open.using((m) => [m.domain]))
    .module('adapters', files('src/adapters/**'), using((m) => [m.domain, m.application, pkg('*')])),
);

const base = ruleset()
  .rules({ 'cognitive-complexity': { max: 15 } })
  .on(app.modules.adapters, { 'file-cohesion': { maxLines: 300 } });

export default defineConfig({ root: app, rulesets: { default: base } });
```

`defineConfig` takes these keys:

| Key | Takes | Default |
| --- | --- | --- |
| `root` | the archetype of the config's folder | required |
| `tsconfig` | a path, or a list of paths, relative to the config | `'tsconfig.json'` |
| `plugins` | custom rules by namespace, see [custom-rules.md](custom-rules.md) | none |
| `rulesets` | rulesets by name, see [Rulesets](#rulesets) | none |

Node strips the types itself, so there is no build step. `@yearofthedan/warp` in the config resolves to the warp that
is running, whether or not the project installs it. The config and its rules load as ES modules, so in a project
whose `package.json` sets `"type": "commonjs"`, name them `.mts`. Unknown keys, rules and options are refused, so a
misspelling fails loudly.

## Builder

Functions, imported from `@yearofthedan/warp`:

| Function | Makes |
| --- | --- |
| `defineConfig({ ... })` | The config, with the keys above. |
| `archetype(name?)` | An archetype: named for reuse, or unnamed for one module's own. |
| `dir(...paths)` | A folder module for each folder that matches. `dir()` alone, in `.requires()`, asks for any folder module. |
| `files(...patterns)` | A files module of the matching files in its folder module. `files()` alone, in `.requires()`, asks for any files module. |
| `all()` | Everything a module holds, for `exposes`. |
| `mirror(from, to)` | A test module's folder: its module's folder with the prefix `from` swapped for `to`. |
| `pkg(pattern)` | A package, for `using`: `pkg('zod')`, `pkg('node:*')`, `pkg('*')`. |
| `using(...)`, `exposes(...)`, `contains(...)` | An unnamed archetype that starts with that method. |
| `ruleset()` | A ruleset, see [Rulesets](#rulesets). |

Archetype methods. Each returns a new archetype, so one archetype can be wired differently in each place it is used:

| Method | Declares | Section |
| --- | --- | --- |
| `.contains((c, { required, self }) => c.module(...))` | The modules inside it, in dependency order, and its test modules with `c.testModule(...)`. | [Modules](#modules), [Tests](#tests) |
| `.using((m) => [...])` or `.using([...])` | What its files may import. `m` holds the modules declared above. | [Reach](#reach) |
| `.exposes(all() \| files(...) \| (m) => ({ ... }))` | What other modules may import from it. | [Reach](#reach) |
| `.entry(files(...))` | Its one way in, in place of `exposes`. | [Reach](#reach) |
| `.requires({ name: archetype \| dir() \| files() })` | What it needs from the modules above it. | [Requires](#requires-provides-identify-and-self) |
| `.provides((m) => ({ name: m.x }))` | One of its modules, for those below that require it. | [Requires](#requires-provides-identify-and-self) |
| `.identify({ marker } \| { match })` | Which folders that match its `dir` count. | [Identify](#requires-provides-identify-and-self) |
| `.testExposes((m) => ({ ... }))` | What tests in other modules may import from it, beside its `exposes`. | [Tests](#tests) |
| `.testUsing((m) => [...])` or `.testUsing([...])` | What every test module at and below its modules may import. | [Tests](#tests) |
| `.description(text)` | What it is for, as a note for whoever reads the config. | |

## Modules

Every boundary the config declares is a module, made by `.module(name, selector, archetype?)` inside `.contains()`:

```ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, using } from '@yearofthedan/warp';

const layer = archetype('layer')
  .contains((c) => c.module('src', files('**'), exposes(all())).module('generated', files('**/*.gen.ts')))
  .exposes(all());

const app = archetype('app').contains((c) =>
  c
    .module('domain', dir('src/domain'), layer)
    .module('adapters', dir('src/adapters'), layer.using((m) => [m.domain, pkg('*')]))
    .module('main', files('src/main.ts'), using((m) => [m.adapters])),
);

export default defineConfig({ root: app });
```

- `dir(...)` makes a folder module for each folder it matches, shaped by the archetype given, or by none: a folder
  module with no modules of its own owns every file in it. `files(...)` makes a files module of the matching files in
  its folder module; it takes no named archetype.
- The third argument is only ever an archetype. `layer.using(...)` is the same `layer`, wired at this place. `using()`,
  `exposes()` and `archetype()` with no name start an archetype of the module's own, for a module that needs wiring or
  modules but no reusable name. Put `.using()` last in the chain, so `m` is typed.
- An archetype is a value, so wiring that several modules share is a `const`. The first example's
  `const open = exposes(all())` makes `domain` `open`, and `application` `open.using((m) => [m.domain])`.
- [`warp model`](cli.md) shows how warp reads the config. A folder module's id is its folder (`(root)` for the root), and
  a files module's is its folder and name, `src/domain:src`.
- The root module is the config's folder. A `dir` path is folder names and whole-segment placeholders (`src/ui`,
  `{name}`, `src/{name}`), relative to its module; a marker or `match` decides which matching folders count.
- In a files pattern, `**` spans folders, `*` stays within one, `{name}` is the module's own capture, and the rest is
  literal.
- The most specific module wins: a literal dir segment beats a placeholder, and a literal file path beats any glob,
  then the longer literal suffix after the last `*`, with `**` last. Two equally specific modules are a config error.
- A file belongs to its deepest folder module, then to the files module there that matches it. One no files module
  matches is loose, and `check` and `diff` report it as [`unclassified`](../src/builtins/unclassified/README.md).
- warp reads every file of the programs its `tsconfig` files make, except declaration files and its own config file.
  For a solution-style tsconfig, list each project config: `tsconfig: ['tsconfig.app.json', 'tsconfig.node.json']`.

## Requires, provides, identify and self

```ts
import { all, archetype, defineConfig, dir, exposes, files, using } from '@yearofthedan/warp';

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ strings: dir() })
  .contains((c, { required, self }) =>
    c
      .module('subcomponent', dir('{name}'), self)
      .module('logic', files('*.ts'), exposes(all()))
      .module('dom', files('{name}.dom.ts'), exposes(all()).using((m) => [m.logic, m.subcomponent.render, required.strings])),
  )
  .exposes((m) => ({ render: m.dom }));

const app = archetype('app')
  .contains((c) =>
    c.module('strings', dir('src/strings'), exposes(all())).module('components', dir('src/ui/{name}'), component),
  )
  .provides((m) => ({ strings: m.strings }));

export default defineConfig({ root: app });
```

- **Order is dependency order.** A module sees only the modules declared above it, so `subcomponent` comes before
  `dom`, and two siblings can't use each other. An archetype reaches modules above it only through `.requires()`,
  which the nearest `.provides()` satisfies.
- **Requires and provides.** `.requires()` is an archetype's interface to its ancestors, typed by archetype, or by
  `dir()` and `files()` for a module with no named archetype. `.provides()` offers one of its modules to anything
  below that requires it by that name, and the nearest provider wins: `required.strings` in a component at any depth
  reaches `src/strings`. Before any file is read, the config is refused for a requirement with no provider above a
  module that has it, a requirement no module lists in `using`, or a provider of the wrong archetype. A provision
  nothing below requires is a warning. A module's own archetype sees what its holder requires and declares none.
- **Identify and captures.** `{name}` in a dir path matches one folder name, and the archetype's own patterns use it:
  for `src/ui/cart`, `dom` is `cart.dom.ts`. `.identify()` says which matching folders count: a `marker` file that
  must exist, or a `match(dir, chain)` function that returns the captures or `false`. A marker matches the
  shallowest folder, and deeper ones are found from inside it. It reads the file system, so a marker can be a file
  outside the program, such as `component.json`.
- **Self.** `self` is the archetype being defined, so it can nest in itself: `subcomponent` finds
  `src/ui/cart/badge`, another component. `m.subcomponent.render` accepts any surface name, since the archetype's
  surfaces aren't known until `.exposes()` runs, and the config is refused when it loads if the name is not one:

```
component.dom uses subcomponent.rendr; subcomponent exposes render
```

## Reach

`check` and `diff` judge every import between project files against the importer's reach,
and report each one outside it as [`dependency-direction`](../src/builtins/dependency-direction/README.md):

- A file reaches the rest of its own module and what its module's `using` names. A file in a files module also
  reaches what its folder module's `using` names. A `required.x` reference reaches what the nearest provider above
  offers.
- A module's surface is what it exposes, and is empty until it says: `exposes(all())` opens its own files and what
  its modules expose, `exposes(files('ports/*.ts'))` some of those, and `.exposes((m) => ({ render: m.dom }))` named
  surfaces. `m.x` reaches what `x` exposes, and `m.x.render` one surface. Naming a module that exposes nothing is a
  config error.
- The surface is set by the config, separately from TypeScript's `export`. With `exposes(files('index.ts'))`,
  `order.ts` can export anything, and another module's import of it is still a finding.
- `.entry(files('index.ts'))` gives a folder module one way in, in place of `exposes`. The entry belongs to the
  folder module itself, ahead of any files module that matches it, and it is the module's whole surface. It reaches
  what the module's own modules expose, so it can re-export them.
- An import is judged on the file its specifier names, so a barrel on a surface lets importers through to the files
  behind it. Type-only imports count.

```ts
import { all, archetype, defineConfig, dir, exposes, files, using } from '@yearofthedan/warp';

const lib = archetype('lib')
  .contains((c) => c.module('core', dir('core'), exposes(all())).module('cli', files('cli.ts'), using((m) => [m.core])))
  .entry(files('index.ts'));

const repo = archetype('repo').contains((c) =>
  c.module('lib', dir('src'), lib).module('scripts', files('scripts/*.ts'), using((m) => [m.lib])),
);

export default defineConfig({ root: repo });
```

```text
src/index.ts       src, the entry: re-exports src/core, and is all that scripts/*.ts reach through m.lib
src/cli.ts         src:cli
src/core/order.ts  src/core, reached from outside src only through index.ts
```

A package import is judged against the `pkg()` entries in the file's reach, and one outside it is reported as
[`module-externals`](../src/builtins/module-externals/README.md):

- A bare specifier that resolves to no project file is a package import. Its package is the specifier's first
  segment, or two for a scoped package, so `@aws-sdk/client-s3/commands` is `@aws-sdk/client-s3`. A Node built-in is
  `node:` and its name, so `fs/promises` is `node:fs`.
- `pkg('x')` covers the package and its subpaths, and `*` matches any run of characters: `pkg('node:*')`,
  `pkg('@aws-sdk/*')`, `pkg('*')`.

## Tests

Test code lives in test modules, declared beside the modules they test:

```ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, using } from '@yearofthedan/warp';

const page = archetype('page')
  .identify({ marker: '{name}.dom.ts' })
  .contains((c) =>
    c
      .module('logic', files('*.ts'), exposes(all()))
      .module('dom', files('{name}.dom.ts'), exposes(all()).using((m) => [m.logic]))
      .testModule('driver', files('*.driver.ts'))
      .testModule('tests', files('*.test.ts'), using((m) => [m.driver])),
  )
  .exposes((m) => ({ render: m.dom }))
  .testExposes((m) => ({ driver: m.driver }));

const site = archetype('site')
  .contains((c) =>
    c
      .module('domain', dir('src/domain'), exposes(all()))
      .module('pages', dir('src/{name}'), page.using((m) => [m.domain]))
      .testModule('fixtures', dir('src/test-helpers'), using((m) => [m.domain]))
      .testModule('e2e', dir('e2e')),
  )
  .testUsing((m) => [m.fixtures, pkg('vitest')]);

export default defineConfig({ root: site });
```

```text
src/cart/cart.ts            src/cart:logic
src/cart/cart.driver.ts     src/cart:driver
src/cart/cart.test.ts       src/cart:tests     reaches logic, dom, the driver, the fixtures and vitest
src/test-helpers/orders.ts  (root):fixtures    reaches domain and vitest
e2e/checkout.test.ts        (root):e2e         reaches each page's render and driver, the fixtures and vitest
```

- `.testModule(name, selector, archetype?)` goes in `.contains()` beside `.module()`, and holds test code: test files
  and the drivers, fixtures and DSLs they share. Its selector is `files(...)` or `dir(...)`, relative to its module
  like any other, or `mirror(...)`. Its archetype is unnamed, from `using()`, `exposes()` or `description()`, and it
  exposes all its files unless it says otherwise.
- A test module reaches its own files, every file of the module that declares it and of that module's files modules,
  what that module reaches, and what its own `using` names. `cart.test.ts` reaches `logic` and `dom` because they
  are `src/cart`'s.
- `.testUsing(...)` is an archetype's test kit: every test module of its modules and of the modules below them reaches
  it, so the root names the runner and the shared fixtures once. Its callback gets the archetype's own modules, test
  modules included, and its requirements: `.testUsing((m, { required }) => [required.seed])`.
- Only test code reaches a test module: through a test module's `using`, a `testUsing`, or a test surface.
  Naming a test module in a production `using`, in `.exposes()` or in `.provides()` is a config error, and a
  production file that imports one is a [`dependency-direction`](../src/builtins/dependency-direction/README.md)
  finding.
- `.testExposes((m) => ({ ... }))` declares an archetype's test surfaces: what tests outside the module may import
  from it, on top of what it exposes. `page` test-exposes `driver: m.driver`, so `e2e/checkout.test.ts` imports
  `cart.driver.ts` through `pages`. A test surface may share a name with a surface in `exposes`, and a test then
  reaches both under that name. Only test code may name a test surface.
- A test surface passes up one module at a time. Had `pages` sat inside a `ui` module, `ui` would pass the drivers
  on with `.testExposes((m) => ({ pages: m.pages }))`, since `.exposes(all())` carries production files alone.
- A test module claims its files ahead of any production module. Where several match, the deepest module's wins,
  then the more specific selector, as for files modules: `dir('e2e')` counts as `files('e2e/**')`, so
  `files('e2e/*.dsl.ts')` beside it takes the DSLs.
- A file is test code only when a test module claims it. A test file nothing claims is production code of its
  module, or loose, and reported by [`unclassified`](../src/builtins/unclassified/README.md), where no files module
  matches it.
- [`module-cycle`](../src/builtins/module-cycle/README.md) leaves test modules' imports out.

### Mirrored tests

When tests sit in a tree of their own, `mirror(from, to)` finds each module's test folder: the module's own folder
with the prefix `from` swapped for `to`.

```ts
import { all, archetype, defineConfig, dir, exposes, files, mirror } from '@yearofthedan/warp';

const component = archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .contains((c, { self }) =>
    c
      .module('sub', dir('{name}'), self)
      .module('code', files('*.ts'), exposes(all()))
      .testModule('tests', mirror('src', 'test')),
  )
  .exposes(all());

const app = archetype('app').contains((c) => c.module('components', dir('src/ui/{name}'), component));

export default defineConfig({ root: app });
```

```text
src/ui/project/project.dom.ts        src/ui/project:code
src/ui/project/graph/graph.dom.ts    src/ui/project/graph:code
test/ui/project/project.test.ts      src/ui/project:tests
test/ui/project/graph/graph.test.ts  src/ui/project/graph:tests
```

- Every file under the mirrored folder belongs to the test module, ahead of any module that holds the folder, and a
  nested module's mirror takes its own subfolder.
- A module outside `from`, or two modules mirroring one folder, is a config error.

## Rulesets

Every rule runs everywhere with its defaults, and [`unclassified`](../src/builtins/unclassified/README.md) at the root
module, until a ruleset says otherwise. A ruleset is a list of lines, each setting rules at one place: `.rules()` for
the whole config, and `.on()` for an archetype, or one of its modules by the handle the archetype gives it after
`.contains()`, `app.modules.adapters`, test modules included, `layer.modules.tests`. A misspelt module fails
to compile. The config names its rulesets, and the one named `default` applies when the command names none.

```ts
import { all, archetype, defineConfig, dir, files, pkg, ruleset } from '@yearofthedan/warp';

const layer = archetype('layer')
  .contains((c) => c.module('src', files('**')).testModule('tests', files('**/*.test.ts')))
  .exposes(all())
  .testUsing([pkg('vitest')]);
const app = archetype('app').contains((c) =>
  c
    .module('domain', dir('src/domain'), layer)
    .module('adapters', dir('src/adapters'), layer.using((m) => [m.domain]))
    .module('generated', dir('src/generated')),
);

const base = ruleset()
  .rules({ 'cognitive-complexity': { max: 15 } })
  .on(layer.modules.tests, { 'function-cohesion': false })
  .on(app.modules.generated, 'off');

const edit = ruleset()
  .extends(base)
  .rules({ 'cognitive-complexity': { max: 12 } })
  .on(app.modules.adapters, { 'file-cohesion': { maxLines: 300 } });

export default defineConfig({ root: app, rulesets: { default: base, edit } });
```

```sh
warp diff HEAD --ruleset edit
warp model --ruleset edit --rules   # what each module changes
```

- Settings are `true`, `false` or options by rule id, or `'off'` for every rule at that place. `'*': false` turns
  every rule off there while the rules listed beside it stay on. Plugin rules are `namespace/id`.
- A later line merges into an earlier one at the same place: options into options, `false` off, and `true` on with
  the options kept. `.extends(base)` puts the base's lines first, so a ruleset changes only what differs. A base can
  be any ruleset, listed in the config or not.
- An archetype's line reaches every module of that archetype, and a module's line every module its selector finds.
  For a finding on a file, the nearest place wins: the file's module, then that module's archetype, then the same for
  each module above it, then `.rules()`. A test module is a module like any other, so a line on the module that
  declares it reaches it too.
  Options merge nearest first.
- `diff` checks both sides with the same ruleset, so a delta comes from the code alone. An unknown name fails and
  lists the rulesets there are.
