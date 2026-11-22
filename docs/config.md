# Config

**Audience:** anyone writing or changing a warp config.
**Purpose:** the config's structure and rulesets, custom rules, and the rules warp checks.

The config is the default export of a `warp.config.ts` (or `.mts`, `.js`, `.mjs`) next to the project's tsconfig. Its
structure declares the units of the codebase and what each part of a unit may use, and its rulesets say which rules
judge each part, and how strictly. Its language is designed in
[docs/design/archetypes.md](design/archetypes.md); this page covers what warp checks today. See
[`warp.config.ts`](../warp.config.ts) for the config this tool checks itself with.

```ts
import { archetype, defineConfig, pkg, ruleset } from 'warp';

const app = archetype('app').contains((p) =>
  p
    .files('domain', 'src/domain/**')
    .files('application', 'src/app/**', { using: (s) => [s.domain] })
    .files('adapters', 'src/adapters/**', { using: (s) => [s.domain, s.application, pkg('*')] }),
);

const base = ruleset()
  .rules({ 'cognitive-complexity': { max: 15 } })
  .on(app.adapters, { 'module-cohesion': { maxLines: 300 } });

export default defineConfig({ root: app, rulesets: { default: base } });
```

Node strips the types itself, so there is no build step. `warp` in an import always means the running warp,
installed in the project or not. The config and its rules load as ES modules: in a project whose `package.json` lacks
`"type": "module"`, name them `.mts` (Node only warns when `type` is missing, but fails on `"type": "commonjs"`).
Unknown keys, rules and options are refused, so a misspelling fails loudly.

## Units and parts

`warp model` shows how warp reads the config:

```sh
warp model           # the units the config finds, the part each file is in, and the loose files
warp model --rules   # the same, with the rule settings each unit and part changes
warp model --json    # the same, for tools, with every unit's and part's resolved rule settings
```

- The root unit is the config's folder. A `p.dir` path is folder names and whole-segment placeholders (`src/ui`,
  `{name}`, `src/{name}`), relative to its unit; a marker or `match` decides which matching folders count.
- In a files pattern, `**` spans folders, `*` stays within one, `{name}` is the unit's own capture, and the rest is
  literal.
- The most specific part wins: a literal dir segment beats a placeholder, and a literal file path beats any glob,
  then the longer literal suffix after the last `*`, with `**` last. Two equally specific parts are a config error.
- A file belongs to its deepest unit. One no part matches is loose, and `check` and `diff` report it as
  [`unclassified`](../src/model/rules/unclassified/README.md) where the unit's `loose` is `deny`, the root's default.
- `tsconfig` takes a list, and warp reads every file of their programs except declaration files. A solution-style
  tsconfig with only `references` is not followed: list the project configs.

## Reach

`check` and `diff` judge every import between project files against the importer's reach,
and report each one outside it as [`dependency-direction`](../src/model/rules/dependency-direction/README.md):

- A file reaches the rest of its own part, what its part's `using` names, and, for a unit's own files, what the
  `using` of the dir part that found the unit names. A `required.x` reference reaches what the nearest provider above
  offers.
- `s.x` on a dir part reaches what its units expose: one surface with `s.x.render`, all of them without. A unit
  exposes its `.exposes()` surfaces, a plain folder all its files, and an archetype with no `.exposes()` its own files
  and what its units expose.
- An import is judged on the file its specifier names, so a barrel on a surface lets importers through to the files
  behind it. Type-only imports count.

A package import is judged the same way, against the `pkg()` entries in the file's reach, and one outside it is
reported as [`unit-externals`](../src/model/rules/unit-externals/README.md). `pkg('x')` covers the package and its subpaths, and `*` matches
any run of characters: `pkg('node:*')`, `pkg('@aws-sdk/*')`, `pkg('*')`.

[`no-double-export`](../src/model/rules/no-double-export/README.md) reports a file on a unit's surface that re-exports another file on that
surface, so there is one way to each name: a barrel over private files, or exposed files with no barrel.
[`no-cross-unit-reexport`](../src/model/rules/no-cross-unit-reexport/README.md) reports a file that re-exports
another unit's file, other than one nested in its own unit, so a unit doesn't pass on what it uses.

An archetype's `.constraints()` gives inline rules by value under local names. `mustImport({ from, to })` reports each
file in `from` that imports nothing in `to`, read in each unit of the archetype; its findings carry the local name as
their rule.

```ts
import { archetype, files, mustImport } from 'warp';

const feature = archetype('feature')
  .requires({ contract: files() })
  .contains((p, { required }) => p.files('logic', '*.ts').files('dsl', '*.dsl.ts', { using: [required.contract] }))
  .constraints((s, { required }) => ({ 'dsl-on-the-contract': mustImport({ from: s.dsl, to: required.contract }) }));
```

[`unit-cycle`](../src/model/rules/unit-cycle/README.md) reports each import between sibling units that lies on a loop among them, and
[`no-cycle`](../src/model/rules/no-cycle/README.md) each import between files that lies on a loop.

`module-cohesion`, `function-cohesion` and `cognitive-complexity` judge each file's code with the options that resolve
for that file, so tests and code, or two parts, can have different thresholds.

## Rulesets

Every rule runs everywhere with its defaults until a ruleset says otherwise. A ruleset is a list of lines, each
setting rules at one place: `.rules()` for the whole config, and `.on()` for an archetype, or one of its parts by the
handle the archetype gives it after `.contains()`. A misspelt part fails to compile. The config names its rulesets,
and the one named `default` applies when the command names none.

```ts
import { archetype, defineConfig, ruleset } from 'warp';

const layer = archetype('layer').contains((p) => p.files('src', '**').files('test', '**/*.test.ts'));
const app = archetype('app').contains((p) =>
  p
    .dir('domain', 'src/domain', layer)
    .dir('adapters', 'src/adapters', layer, { using: (s) => [s.domain] })
    .dir('generated', 'src/generated'),
);

const base = ruleset()
  .rules({ 'cognitive-complexity': { max: 15 } })
  .on(layer.test, { 'function-cohesion': false })
  .on(app.generated, 'off');

const edit = ruleset()
  .extends(base)
  .rules({ 'cognitive-complexity': { max: 12 } })
  .on(app.adapters, { 'module-cohesion': { maxLines: 300 } });

export default defineConfig({ root: app, rulesets: { default: base, edit } });
```

```sh
warp diff HEAD --ruleset edit
warp model --ruleset edit --rules   # what each unit and part changes
```

- Settings are `true`, `false` or options by rule id, or `'off'` for every rule at that place. `'*': false` turns
  every rule off there while the rules listed beside it stay on. Plugin rules are `namespace/id`, and an inline rule
  goes by its local name.
- A later line merges into an earlier one at the same place: options into options, `false` off, and `true` on with
  the options kept. `.extends(base)` puts the base's lines first, so a ruleset changes only what differs. A base need
  not be one of the config's rulesets.
- An archetype's line reaches every unit of that archetype, and a dir part's line every unit it finds. For a finding
  on a file, the nearest place wins: the file's files part, then for its unit and each unit above it the dir part
  that found it and its archetype, then `.rules()`. Options merge nearest first. `loose` decides `unclassified`.
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
import { ConfigError, type ModuleRule, type Plugin } from 'warp';

const noPortsThroughApplication: ModuleRule<{ ports: string[] }> = {
  id: 'no-ports-through-application',
  docs: 'https://example.com/no-ports-through-application.md', // optional, linked from its findings
  defaults: { ports: ['src/application/ports/**'] },
  parseOptions: ({ ports, ...rest }, at) => {
    if (Object.keys(rest).length > 0) throw new ConfigError(`${at}: unknown key ${Object.keys(rest).join(', ')}`);
    if (ports === undefined) return {};
    if (!Array.isArray(ports) || !ports.every((glob) => typeof glob === 'string')) throw new ConfigError(`${at}.ports: expected globs`);
    return { ports };
  },
  check: ({ module, options }) =>
    module.imports
      .filter((edge) => edge.via && options.ports.some((glob) => matchesGlob(edge.to, glob)))
      .map((edge) => ({
        rule: 'no-ports-through-application',
        key: `no-ports-through-application:${module.file}->${edge.to}`,
        file: module.file,
        line: edge.line,
        value: edge.names.length,
        message: `${module.file} reaches the port ${edge.to} through ${edge.via}. Call a use case instead.`,
      })),
};

export default { rules: [noPortsThroughApplication] } satisfies Plugin;
```

```ts
// warp.config.ts
import { archetype, defineConfig, ruleset } from 'warp';
import wt from './warp/rules.ts';

const app = archetype('app').contains((p) =>
  p
    .files('domain', 'src/domain/**')
    .files('application', 'src/application/**', { using: (s) => [s.domain] })
    .files('ui', 'src/ui/**', { using: (s) => [s.application, s.domain] }),
);

const base = ruleset()
  .rules({ 'wt/no-ports-through-application': false })
  .on(app.ui, { 'wt/no-ports-through-application': true });

export default defineConfig({ root: app, plugins: { wt }, rulesets: { default: base } });
```

- A rule reads the same facts as the built-in ones, and never reads source. A `ModuleRule` reads one module at a
  time, with the options that resolve for that file: its imports, units and functions.
- A `ProjectRule`, with `scope: 'project'`, reads the whole project once, with the config, the `model` (each file's
  unit and part through `unitOf` and `partOf`) and the `verdicts` on reach. It looks up its setting for a file with
  `atFile`, or for a unit with `atUnit`, and skips where the rule is off.
- Its findings get the namespaced `rule`, and keys prefixed with the namespace. They link to the rule's `docs` when
  it has one, and to nothing otherwise.
- `defaults` and `parseOptions` are optional: without them, the rule takes no options. `wholeNumberOptions` and
  `ConfigError` are exported for writing `parseOptions`.
- Relative imports need their `.ts` extension, and an import of types alone must be `import type`: Node strips types
  without resolving them, so `import { type ModuleRule }` would still load the module.
- For types in the editor, the project needs `warp` in its `node_modules`: `pnpm link warp` after
  `pnpm link --global`, or the dev dependency. Running needs neither.
- `diff`'s cache key includes the config and every file it imports outside warp, so editing a rule redoes the base.

## Rules

Analysis extracts the facts once for the whole project: the import graph, with re-exports marked, each module's top-level units and the
links between them, and each function's statements and complexity. Each rule is its own folder in
[`src/model/rules/`](../src/model/rules), holding its module and its page, and reads those facts without touching
source, so it stays pure. A rule declares its id, its default options and how to validate them, and a `check` that
returns findings. Most read one module at a time; a project rule reads the whole project and the model once, and
looks up its setting for each file or unit. Rules are looked up in a registry, where a project's
[own rules](#custom-rules) join the built-in ones.

Every finding has a `rule`, a `key` that identifies it across commits, a `value` that `diff` compares, a `message`,
`details` an agent can act on, and for built-in rules a `docs` link to the rule's page. The rules don't know where
their pages are published: [`src/builtins.ts`](../src/builtins.ts) attaches the links where the CLI composes them. The
agent reporters list each rule's link once after the findings, and SARIF gives it as the rule's `helpUri`.

Each rule's page says why it exists, shows code it reports and code it passes, and lists its options:

| Rule | Reports | Options |
| --- | --- | --- |
| [`unclassified`](../src/model/rules/unclassified/README.md) | A loose file where `loose` is `deny`. From the model, so it cannot be turned off. | |
| [`dependency-direction`](../src/model/rules/dependency-direction/README.md) | An import outside the importer's reach. | |
| [`unit-externals`](../src/model/rules/unit-externals/README.md) | A package import that no `using` in the importer's reach lists. | |
| [`no-double-export`](../src/model/rules/no-double-export/README.md) | A re-export, in a file on its unit's surface, of another file on that surface. | |
| [`unit-cycle`](../src/model/rules/unit-cycle/README.md) | An import between sibling units that lies on a loop among them. | `types` |
| [`no-cycle`](../src/model/rules/no-cycle/README.md) | An import between files that lies on a loop. | `types` |
| [`no-cross-unit-reexport`](../src/model/rules/no-cross-unit-reexport/README.md) | A re-export of another unit's file, other than one nested in the re-exporting unit. | |
| [`module-cohesion`](../src/model/rules/module-cohesion/README.md) | A module over a size tripwire whose top-level code falls into unrelated groups (LCOM4). | `maxLines` |
| [`function-cohesion`](../src/model/rules/function-cohesion/README.md) | A function over a size tripwire whose statements fall into unrelated groups. | `maxLines` |
| [`cognitive-complexity`](../src/model/rules/cognitive-complexity/README.md) | A function harder to follow than `max`, by SonarSource's measure. | `max` |

