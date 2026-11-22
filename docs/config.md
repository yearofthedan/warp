# Config

**Audience:** anyone writing or changing a warp config.
**Purpose:** the config file, both its languages, custom rules, rulesets, and the rules warp checks.

warp reads a config in one of two languages. A kinds config, in `warp.config.json` or `warp.config.ts`, sorts
modules into kinds by glob and says which kinds each may import. An archetype config, in `warp.config.ts`, declares
the units of the codebase and what each part of a unit may use.

## Kinds

```json
{
  "tsconfig": "tsconfig.json",
  "exclude": ["**/*.test.ts"],
  "rules": {
    "no-cross-kind-reexport": { "allow": [] },
    "module-cohesion": { "maxLines": 200 },
    "function-cohesion": { "maxLines": 40 },
    "cognitive-complexity": { "max": 15 }
  },
  "kinds": {
    "domain": { "match": "src/domain/**", "dependsOn": [] },
    "app": { "match": "src/app/**", "dependsOn": ["domain"] },
    "adapter": {
      "match": ["src/adapters/**"],
      "dependsOn": ["domain", "app"],
      "rules": { "module-cohesion": { "maxLines": 300 }, "function-cohesion": false }
    },
    "utility": { "match": "src/lib/**", "dependsOn": [] }
  }
}
```

- `kinds` are checked in the order written and the first whose `match` glob fits a file wins, so put narrow globs
  first. A kind may always import from itself.
- Every rule runs on every kind. `rules` at the top level sets options for all kinds, and a kind's own `rules`
  overrides them. `false` turns a rule off, and `true` turns it back on for a kind. The options shown are the defaults.
- Unknown keys, rules and options are refused, so a misspelling fails loudly. Limits are whole numbers of at least 1.
- `exclude` removes files from the model entirely. Declaration files are always excluded.
- The files checked are the ones the tsconfig includes. A solution-style tsconfig with only `references` is not
  followed: point `tsconfig` at a project config.

See [`warp.config.json`](../warp.config.json) for the config this tool checks itself with.

A `warp.config.ts` (or `.mts`, `.js`, `.mjs`) takes the same shape as its default export. `defineConfig` types it:

```ts
import { defineConfig } from 'warp';

export default defineConfig({
  exclude: ['**/*.test.ts'],
  kinds: {
    domain: { match: 'src/domain/**' },
    app: { match: 'src/app/**', dependsOn: ['domain'] },
  },
});
```

Node strips the types itself, so there is no build step. `warp` in an import always means the running warp,
installed in the project or not. The config and its rules load as ES modules: in a project whose `package.json` lacks
`"type": "module"`, name them `.mts` (Node only warns when `type` is missing, but fails on `"type": "commonjs"`).

## Archetypes

A `warp.config.ts` whose default export is `defineConfig({ root })` is read as an archetype config. Its language is
designed in [docs/design/archetypes.md](design/archetypes.md); this section covers what warp checks today.
`warp model` shows how warp reads the config:

```sh
warp model           # the units the config finds, the part each file is in, and the loose files
warp model --json    # the same, for tools
```

- The root unit is the config's folder. A `p.dir` path is folder names and whole-segment placeholders (`src/ui`,
  `{name}`, `src/{name}`), relative to its unit; a marker or `match` decides which matching folders count.
- In a files pattern, `**` spans folders, `*` stays within one, `{name}` is the unit's own capture, and the rest is
  literal.
- The most specific part wins: a literal dir segment beats a placeholder, and a literal file path beats any glob,
  then the longer literal suffix after the last `*`, with `**` last. Two equally specific parts are a config error.
- A file belongs to its deepest unit. One no part matches is loose, and `check` and `diff` report it as
  [`unclassified`](./unclassified.md) where the unit's `loose` is `deny`, the root's default.
- `tsconfig` takes a list, and warp reads every file of their programs.

`check` and `diff` on an archetype config judge every import between project files against the importer's reach,
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
reported as [`unit-externals`](./unit-externals.md). `pkg('x')` covers the package and its subpaths, and `*` matches
any run of characters: `pkg('node:*')`, `pkg('@aws-sdk/*')`, `pkg('*')`.

[`no-double-export`](./no-double-export.md) reports a file on a unit's surface that re-exports another file on that
surface, so there is one way to each name: a barrel over private files, or exposed files with no barrel.

Rule settings go in four places: `defineConfig({ rules })`, `.rules()` on an archetype, and `rules` in a dir or files
part's options. For a finding on a file, the nearest setting wins: the file's files part, then for its unit and each
unit above it the dir part that found it and its archetype, then the global settings. `'off'` turns every rule off at
that level, and `'*': false` does the same while the rules listed beside it stay on. Options merge nearest first.
`loose` decides `unclassified`.

```ts fragment
.dir('generated', 'src/generated', { rules: 'off' })
.dir('modules', '{name}', module, { rules: { 'unit-cycle': false } })
```

An inline rule is given by value under a local name, on an archetype or a part. `mustImport({ from, to })` reports
each file in `from` that imports nothing in `to`, read in each unit of the archetype that declares it; its findings
carry the local name as their rule.

[`unit-cycle`](./unit-cycle.md) reports each import between sibling units that lies on a loop among them, and
[`no-cycle`](./no-cycle.md) each import between files that lies on a loop.

## Custom rules

A project adds its own rules in a `warp.config.ts`, as plugins: objects with a `rules` list, imported, never named
by path. Each plugin gets a namespace, and its rules are `namespace/id` in `rules` and in each kind's `rules`. They
go through the same option checks as the built-in rules, and two rules with the same id are refused.

Working title's application layer re-exports its ports so adapters can implement them, which lets the UI reach a port
through `application` without breaking `dependency-direction`. A rule for that, in `warp/rules.ts`:

```ts
// warp/rules.ts
import { matchesGlob } from 'node:path';
import { ConfigError, type Plugin, type Rule } from 'warp';

const noPortsThroughApplication: Rule<{ ports: string[] }> = {
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
import { defineConfig } from 'warp';
import wt from './warp/rules.ts';

export default defineConfig({
  plugins: { wt },
  rules: { 'wt/no-ports-through-application': false },
  kinds: {
    domain: { match: 'src/domain/**' },
    application: { match: 'src/application/**', dependsOn: ['domain'] },
    ui: { match: 'src/ui/**', dependsOn: ['application', 'domain'], rules: { 'wt/no-ports-through-application': true } },
  },
});
```

- A rule reads the same facts as the built-in ones, through `RuleContext`: the module's imports, units and functions,
  its kind and options, and `kindOf` for any other module. It never reads source.
- Its findings get the namespaced `rule`, and keys prefixed with the namespace. They link to the rule's `docs` when
  it has one, and to nothing otherwise.
- `defaults` and `parseOptions` are optional: without them, the rule takes no options. `wholeNumberOptions` and
  `ConfigError` are exported for writing `parseOptions`.
- Relative imports need their `.ts` extension, and an import of types alone must be `import type`: Node strips types
  without resolving them, so `import { type Rule }` would still load the module.
- For types in the editor, the project needs `warp` in its `node_modules`: `pnpm link warp` after
  `pnpm link --global`, or the dev dependency. Running needs neither.
- `diff`'s cache key includes the config and every file it imports outside warp, so editing a rule redoes the base.

## Rulesets

A ruleset checks the same architecture with different rules, such as a stricter limit after each edit, while the
agent still has the code in context, than at the PR gate. It is a named export of `warp.config.ts`: a list of the
base config and overlays, which warp merges in order.

```ts
// warp.config.ts
import { defineConfig, type Ruleset } from 'warp';

const base = defineConfig({
  rules: { 'cognitive-complexity': { max: 15 } },
  kinds: {
    domain: { match: 'src/domain/**' },
    adapter: { match: 'src/adapters/**', dependsOn: ['domain'], rules: { 'module-cohesion': { maxLines: 300 } } },
  },
});

export default base;

export const edit = [
  base,
  {
    rules: { 'cognitive-complexity': { max: 12 } },
    kinds: { adapter: { rules: { 'module-cohesion': false } } },
  },
] satisfies Ruleset;
```

```sh
warp diff HEAD --ruleset edit
warp --print-config --ruleset edit   # the merged result, per kind
```

- An overlay sets `rules` only: at the top level, merged by rule id, and under `kinds`, merged by kind name and then
  rule id. Kinds' globs and `dependsOn`, `exclude`, `tsconfig` and `plugins` stay as the base has them, and an overlay
  that sets them is refused, as is a kind the base doesn't declare.
- For the same rule, an overlay's options merge into the base's, `false` turns the rule off, and `true` turns it on
  and keeps the base's options. After merging, the usual layering applies: defaults, then top-level `rules`, then the
  kind's.
- Rulesets are the config's named exports that are lists, so it can export other values too. An unknown name fails
  and lists the rulesets there are. A JSON config has no rulesets.
- `diff` checks both sides with the same ruleset, and each ruleset caches its own findings, so switching rulesets
  never shows up as new findings.
- No `extends` between rulesets yet: each starts from a base. Share overlays as plain constants if two need the same.

## Rules

Analysis extracts the facts once for the whole project: the import graph, with re-exports marked, each module's top-level units and the
links between them, and each function's statements and complexity. Each rule is its own module in
[`src/model/rules/`](../src/model/rules) that reads those facts for one module at a time, so it stays pure. A rule
declares its id, its default options and how to validate them, and a `check` that returns findings. Rules are looked
up in a registry, where a project's [own rules](#custom-rules) join the built-in ones.

Every finding has a `rule`, a `key` that identifies it across commits, a `value` that `diff` compares, a `message`,
`details` an agent can act on, and for built-in rules a `docs` link to the rule's page. The rules don't know where
their pages are published: [`src/builtins.ts`](../src/builtins.ts) attaches the links where the CLI composes them. The
agent reporters list each rule's link once after the findings, and SARIF gives it as the rule's `helpUri`.

Each rule's page says why it exists, shows code it reports and code it passes, and lists its options:

| Rule | Reports | Options |
| --- | --- | --- |
| [`unclassified`](./unclassified.md) | A module that matches no kind. From the model, so it cannot be turned off. | |
| [`dependency-direction`](../src/model/rules/dependency-direction/README.md) | An import from a kind the importer's kind does not list in `dependsOn`, followed through barrels; in an archetype config, an import outside the importer's reach. | |
| [`unit-externals`](./unit-externals.md) | In an archetype config, a package import that no `using` in the importer's reach lists. | |
| [`no-double-export`](./no-double-export.md) | In an archetype config, a re-export, in a file on its unit's surface, of another file on that surface. | |
| [`unit-cycle`](./unit-cycle.md) | In an archetype config, an import between sibling units that lies on a loop among them. | `types` |
| [`no-cycle`](./no-cycle.md) | In an archetype config, an import between files that lies on a loop. | `types` |
| [`no-cross-kind-reexport`](../src/model/rules/no-cross-kind-reexport/README.md) | A module that re-exports what another kind declares. | `allow` |
| [`module-cohesion`](../src/model/rules/module-cohesion/README.md) | A module over a size tripwire whose top-level code falls into unrelated groups (LCOM4). | `maxLines` |
| [`function-cohesion`](../src/model/rules/function-cohesion/README.md) | A function over a size tripwire whose statements fall into unrelated groups. | `maxLines` |
| [`cognitive-complexity`](../src/model/rules/cognitive-complexity/README.md) | A function harder to follow than `max`, by SonarSource's measure. | `max` |

