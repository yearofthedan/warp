# Config

**Audience:** anyone writing or changing a warp config.
**Purpose:** the config's structure and rulesets, custom rules, and the rules warp checks.

The config is the default export of a `warp.config.ts` (or `.mts`, `.js`, `.mjs`) next to the project's tsconfig. Its
structure declares the modules of the codebase and what each module may use, and its rulesets say which rules judge
each module, and how strictly. Its language is designed in
[docs/design/archetypes.md](design/archetypes.md); this page covers what warp checks today. See
[`warp.config.ts`](../warp.config.ts) for the config this tool checks itself with.

```ts
import { all, archetype, defineConfig, exposes, files, pkg, ruleset, using } from 'warp';

const app = archetype('app').contains((m) =>
  m
    .module('domain', files('src/domain/**'), exposes(all()))
    .module('application', files('src/app/**'), exposes(all()).using((m) => [m.domain]))
    .module('adapters', files('src/adapters/**'), using((m) => [m.domain, m.application, pkg('*')])),
);

const base = ruleset()
  .rules({ 'cognitive-complexity': { max: 15 } })
  .on(app.modules.adapters, { 'file-cohesion': { maxLines: 300 } });

export default defineConfig({ root: app, rulesets: { default: base } });
```

Node strips the types itself, so there is no build step. `warp` in an import always means the running warp,
installed in the project or not. The config and its rules load as ES modules: in a project whose `package.json` lacks
`"type": "module"`, name them `.mts` (Node only warns when `type` is missing, but fails on `"type": "commonjs"`).
Unknown keys, rules and options are refused, so a misspelling fails loudly.

## Modules

Every boundary the config declares is a module, made by `.module(name, selector, archetype?)` inside `.contains()`:

```ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, using } from 'warp';

const layer = archetype('layer')
  .contains((m) => m.module('src', files('**'), exposes(all())).module('generated', files('**/*.gen.ts')))
  .exposes(all());

const app = archetype('app').contains((m) =>
  m
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
- `warp model` shows how warp reads the config. A folder module's id is its folder (`.` for the root), and a files
  module's is its folder and name, `src/domain:src`.

```sh
warp model           # the modules the config finds, the files in each, and the loose files
warp model --rules   # the same, with the rule settings each module changes
warp model --json    # the same, for tools, with every module's resolved rule settings
```

- The root module is the config's folder. A `dir` path is folder names and whole-segment placeholders (`src/ui`,
  `{name}`, `src/{name}`), relative to its module; a marker or `match` decides which matching folders count.
- In a files pattern, `**` spans folders, `*` stays within one, `{name}` is the module's own capture, and the rest is
  literal.
- The most specific module wins: a literal dir segment beats a placeholder, and a literal file path beats any glob,
  then the longer literal suffix after the last `*`, with `**` last. Two equally specific modules are a config error.
- A file belongs to its deepest folder module, then to the files module there that matches it. One no files module
  matches is loose, and `check` and `diff` report it as [`unclassified`](../src/builtins/unclassified/README.md): on
  the root module unless a ruleset turns it off, and below it where a ruleset turns it on.
- `tsconfig` takes a list, and warp reads every file of their programs except declaration files. A solution-style
  tsconfig with only `references` is not followed: list the project configs.

## Reach

`check` and `diff` judge every import between project files against the importer's reach,
and report each one outside it as [`dependency-direction`](../src/builtins/dependency-direction/README.md):

- A file reaches the rest of its own module and what its module's `using` names. A file in a files module also
  reaches what its folder module's `using` names. A `required.x` reference reaches what the nearest provider above
  offers.
- A module exposes nothing until it says so: `exposes(all())` opens its own files and what its modules expose,
  `exposes(files('index.ts'))` some of those, and `.exposes((m) => ({ render: m.dom }))` named surfaces. `m.x`
  reaches what `x` exposes, and `m.x.render` one surface. Naming a module that exposes nothing is a config error.
- An import is judged on the file its specifier names, so a barrel on a surface lets importers through to the files
  behind it. Type-only imports count.

A package import is judged the same way, against the `pkg()` entries in the file's reach, and one outside it is
reported as [`module-externals`](../src/builtins/module-externals/README.md). `pkg('x')` covers the package and its subpaths, and `*` matches
any run of characters: `pkg('node:*')`, `pkg('@aws-sdk/*')`, `pkg('*')`.

[`no-double-export`](../src/builtins/no-double-export/README.md) reports a file on a module's surface that re-exports another file on that
surface, so there is one way to each name: a barrel over private files, or exposed files with no barrel.
[`no-cross-module-reexport`](../src/builtins/no-cross-module-reexport/README.md) reports a file that re-exports
another module's file, other than one nested in its own module, so a module doesn't pass on what it uses.

[`module-cycle`](../src/builtins/module-cycle/README.md) reports each import between sibling modules that lies on a loop among them, and
[`no-cycle`](../src/builtins/no-cycle/README.md) each import between files that lies on a loop.

`file-cohesion`, `function-cohesion` and `cognitive-complexity` judge each file's code with the options that resolve
for that file, so tests and code, or two modules, can have different thresholds.

## Tests

The config names its test entry files, and each one belongs to the folder module that holds it:

```ts
import { all, archetype, contains, defineConfig, dir, exposes, files, pkg, using } from 'warp';

const page = archetype('page')
  .identify({ marker: '{name}.dom.ts' })
  .contains((m) =>
    m
      .module('logic', files('*.ts'), exposes(all()))
      .module('dom', files('{name}.dom.ts'), exposes(all()).using((m) => [m.logic])),
  )
  .exposes((m) => ({ render: m.dom }))
  .tests(contains((t) => t.module('driver', files('*.driver.ts'))).exposes((t) => ({ driver: t.driver })));

const site = archetype('site')
  .contains((m) =>
    m.module('domain', dir('src/domain'), exposes(all())).module('pages', dir('src/{name}'), page.using((m) => [m.domain])),
  )
  .tests(dir('e2e'), using([pkg('vitest')]));

export default defineConfig({ root: site, tests: files('**/*.test.ts') });
```

```
src/cart/cart.dom.ts       page src/cart, module dom
src/cart/cart.ts           page src/cart, module logic
src/cart/cart.test.ts      test of src/cart: sees logic, dom, its driver, and vitest
src/cart/cart.driver.ts    test module src/cart:tests.driver
e2e/checkout.test.ts       test of the root: sees each page's render and driver
e2e/helpers.ts             test support of the root, in its located e2e folder
```

- `tests:` takes globs and has no default. A test file in a folder module is owned by that module, never by a files
  module inside it, and sees all of the module's files and what its modules use. Nothing in production may import a
  test file or a test module: [`dependency-direction`](../src/builtins/dependency-direction/README.md) reports it.
- `.tests(locator?, layer)` gives an archetype a test layer: an archetype of its own, from `contains()`, `using()` or
  `exposes()`. Its test modules hold test support (drivers, fixtures, DSLs) and see what the layer sees. Its `using`
  reaches every test below it, so the root names the test runner once. What it exposes reaches the tests of the
  modules above, as `m.cart.tests.driver`.
- A locator, `dir('e2e')` or `files(...)`, moves the module's tests: every file there is test support, and the ones
  the `tests:` globs match are entries. A files module claims its own tests the same way, `files('*.ts', ...)` with
  `using(...).tests(files('*.logic.test.ts'))`, and then they see its files, not the rest of the folder module.
- In a `using` callback, the second argument names the archetype's requirements, so a layer can reach one:
  `.tests(using((m, { required }) => [required.application]))`.
- [`module-cycle`](../src/builtins/module-cycle/README.md) counts production imports only.
- `tests` names the test layer, so no module takes that name.

## Rulesets

Every rule runs everywhere with its defaults until a ruleset says otherwise. A ruleset is a list of lines, each
setting rules at one place: `.rules()` for the whole config, and `.on()` for an archetype, or one of its modules by the
handle the archetype gives it after `.contains()`, `app.modules.adapters`, or its tests after `.tests()`,
`layer.modules.tests`. A misspelt module fails to compile. The config names its rulesets,
and the one named `default` applies when the command names none.

```ts
import { all, archetype, defineConfig, dir, files, pkg, ruleset, using } from 'warp';

const layer = archetype('layer')
  .contains((m) => m.module('src', files('**')))
  .exposes(all())
  .tests(using([pkg('vitest')]));
const app = archetype('app').contains((m) =>
  m
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

export default defineConfig({ root: app, tests: files('**/*.test.ts'), rulesets: { default: base, edit } });
```

```sh
warp diff HEAD --ruleset edit
warp model --ruleset edit --rules   # what each module changes
```

- Settings are `true`, `false` or options by rule id, or `'off'` for every rule at that place. `'*': false` turns
  every rule off there while the rules listed beside it stay on. Plugin rules are `namespace/id`.
- A later line merges into an earlier one at the same place: options into options, `false` off, and `true` on with
  the options kept. `.extends(base)` puts the base's lines first, so a ruleset changes only what differs. A base need
  not be one of the config's rulesets.
- An archetype's line reaches every module of that archetype, and a module's line every module its selector finds.
  For a finding on a file, the nearest place wins: the file's module, then that module's archetype, then the same for
  each module above it, then `.rules()`. For a test file, each module's test layer comes before the module itself.
  Options merge nearest first. Where no line
  sets `unclassified`, it is on at the root module and off below.
- `diff` checks both sides with the same ruleset, and each ruleset caches its own findings, so switching rulesets
  never shows up as new findings. An unknown name fails and lists the rulesets there are.

## Custom rules

A project adds its own rules as plugins: objects with a `rules` list, imported in the config, never named by path.
Each plugin gets a namespace, and its rules are `namespace/id` in rulesets. They go through the same
option checks as the built-in rules, and two rules with the same id are refused.

Working title's application layer re-exports its ports so adapters can implement them, which lets the UI reach a port
through `application` without breaking `dependency-direction`. A rule for that, in `warp/rules.ts`:

```ts
// warp/rules.ts
import { matchesGlob } from 'node:path';
import { ConfigError, dir, type FileRule, files, type Plugin } from 'warp';

const noPortsThroughApplication: FileRule<{ ports: string[] }> = {
  id: 'no-ports-through-application',
  docs: 'https://example.com/no-ports-through-application.md', // optional, linked from its findings
  defaults: { ports: ['src/application/ports/**'] },
  parseOptions: ({ ports, ...rest }, at) => {
    if (Object.keys(rest).length > 0) throw new ConfigError(`${at}: unknown key ${Object.keys(rest).join(', ')}`);
    if (ports === undefined) return {};
    if (!Array.isArray(ports) || !ports.every((glob) => typeof glob === 'string')) throw new ConfigError(`${at}.ports: expected globs`);
    return { ports };
  },
  check: ({ file, options }) =>
    file.imports
      .filter((edge) => edge.via && options.ports.some((glob) => matchesGlob(edge.to, glob)))
      .map((edge) => ({
        rule: 'no-ports-through-application',
        key: `no-ports-through-application:${file.path}->${edge.to}`,
        file: file.path,
        line: edge.line,
        value: edge.names.length,
        message: `${file.path} reaches the port ${edge.to} through ${edge.via}. Call a use case instead.`,
      })),
};

export default { rules: [noPortsThroughApplication] } satisfies Plugin;
```

```ts
// warp.config.ts
import { all, archetype, defineConfig, exposes, files, ruleset, using } from 'warp';
import wt from './warp/rules.ts';

const app = archetype('app').contains((m) =>
  m
    .module('domain', files('src/domain/**'), exposes(all()))
    .module('application', files('src/application/**'), exposes(files('src/application/index.ts')).using((m) => [m.domain]))
    .module('ui', files('src/ui/**'), using((m) => [m.application, m.domain])),
);

const base = ruleset()
  .rules({ 'wt/no-ports-through-application': false })
  .on(app.modules.ui, { 'wt/no-ports-through-application': true });

export default defineConfig({ root: app, plugins: { wt }, rulesets: { default: base } });
```

- A rule reads the same facts as the built-in ones, and never reads source. A `FileRule` reads one file at a
  time, with the options that resolve for that file: its imports, members and functions.
- A `ProjectRule`, with `scope: 'project'`, reads the whole project once, with the config, the `model` (each file's
  module through `moduleOf`) and the `verdicts` on reach. It looks up its setting for a file with
  `atFile`, or for a module with `atModule`, and skips where the rule is off.
- Its findings get the namespaced `rule`, and keys prefixed with the namespace. They link to the rule's `docs` when
  it has one, and to nothing otherwise.
- `defaults` and `parseOptions` are optional: without them, the rule takes no options. `wholeNumberOptions` and
  `ConfigError` are exported for writing `parseOptions`.
- Relative imports need their `.ts` extension, and an import of types alone must be `import type`: Node strips types
  without resolving them, so `import { type FileRule }` would still load the module.
- For types in the editor, the project needs `warp` in its `node_modules`: `pnpm link warp` after
  `pnpm link --global`, or the dev dependency. Running needs neither.
- `diff`'s cache key includes the config and every file it imports outside warp, so editing a rule redoes the base.

## Rules

Analysis extracts the facts once for the whole project: the import graph, with re-exports marked, each file's top-level members and the
links between them, and each function's statements and complexity. Each rule is its own folder in
[`src/builtins/`](../src/builtins), holding its rule and its page, and reads those facts without touching
source, so it stays pure. A rule declares its id, its default options and how to validate them, and a `check` that
returns findings. Most read one file at a time; a project rule reads the whole project and the model once, and
looks up its setting for each file or module. Rules are looked up in a registry, where a project's
[own rules](#custom-rules) join the built-in ones.

Every finding has a `rule`, a `key` that identifies it across commits, a `value` that `diff` compares, a `message`,
`details` an agent can act on, and for built-in rules a `docs` link to the rule's page. The rules don't know where
their pages are published: [`src/builtins/index.ts`](../src/builtins/index.ts) attaches the links where the CLI composes them. The
agent reporters list each rule's link once after the findings, and SARIF gives it as the rule's `helpUri`.

Each rule's page says why it exists, shows code it reports and code it passes, and lists its options:

| Rule | Reports | Options |
| --- | --- | --- |
| [`unclassified`](../src/builtins/unclassified/README.md) | A loose file. On at the root module, off below, unless a ruleset says otherwise. | |
| [`dependency-direction`](../src/builtins/dependency-direction/README.md) | An import outside the importer's reach. | |
| [`module-externals`](../src/builtins/module-externals/README.md) | A package import that no `using` in the importer's reach lists. | |
| [`no-double-export`](../src/builtins/no-double-export/README.md) | A re-export, in a file on its module's surface, of another file on that surface. | |
| [`module-cycle`](../src/builtins/module-cycle/README.md) | An import between sibling modules that lies on a loop among them. | `types` |
| [`no-cycle`](../src/builtins/no-cycle/README.md) | An import between files that lies on a loop. | `types` |
| [`no-cross-module-reexport`](../src/builtins/no-cross-module-reexport/README.md) | A re-export of another module's file, other than one nested in the re-exporting module. | |
| [`file-cohesion`](../src/builtins/file-cohesion/README.md) | A file over a size tripwire whose top-level code falls into unrelated groups (LCOM4). | `maxLines` |
| [`function-cohesion`](../src/builtins/function-cohesion/README.md) | A function over a size tripwire whose statements fall into unrelated groups. | `maxLines` |
| [`cognitive-complexity`](../src/builtins/cognitive-complexity/README.md) | A function harder to follow than `max`, by SonarSource's measure. | `max` |

