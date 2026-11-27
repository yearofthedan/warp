# Custom rules

**Audience:** anyone writing a rule of their own for warp.
**Purpose:** how to add a rule as a plugin, and the facts and context a rule reads.

A project adds its own rules as plugins: files whose default export is an object with a `rules` list, named under
`plugins` in the config by a path from the config's folder or an `npm:` package. Each plugin gets a
namespace, and its rules are `namespace/id` in rulesets. They go through the same option checks as the built-in
rules, and two rules with the same id are refused.

## A file rule

This rule reports a UI file that reaches a port through the application's barrel:

```ts
// warp/rules.ts
import { matchesGlob } from 'node:path';
import { ConfigError, type FileRule, type Plugin } from '@yearofthedan/warp';

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

```yaml
# warp.yaml
plugins:
  local: ./warp/rules.ts

root:
  modules:
    domain: { files: 'src/domain/**', exposes: all }
    application:
      files: 'src/application/**'
      dependencies: [domain]
      exposes: { files: [src/application/index.ts] }
    ui:
      files: 'src/ui/**'
      dependencies: [application, domain]
      ruleset: { rules: { local/no-ports-through-application: on } }
  ruleset: [warp:recommended]
```

- A plugin's rules run only where a ruleset turns them on: here, in `ui` alone. A plugin can also offer rulesets,
  `export default { rules, rulesets: { recommended: { rules: { 'local/no-ports-through-application': 'on' } } } }`,
  which a config extends as `local:recommended`. Their rule ids carry the namespace, as in the config.
- Relative imports need their `.ts` extension, and an import of types alone must be `import type`, since Node strips
  types without resolving them.
- Types in the editor come from the `@yearofthedan/warp` dev dependency.
- `defaults` and `parseOptions` are optional: a rule without them takes no options. `wholeNumberOptions` and
  `ConfigError` are exported for writing `parseOptions`.
- A rule's findings get the namespaced `rule`, and keys prefixed with the namespace. They link to the rule's `docs`
  when it has one.
- `diff` caches findings by the config and every file its plugins import, so editing a rule redoes the base.

## A rule that requires an import

A rule can also report an import that is missing. In this project every DSL builds its steps on the driver contract,
so each `*.dsl.ts` must import `src/drivers/driver.ts`:

```ts
// warp/dsl.ts
import type { FileRule, Plugin } from '@yearofthedan/warp';

const contract = 'src/drivers/driver.ts';

const dslOnDriver: FileRule = {
  id: 'dsl-on-driver',
  check: ({ file }) =>
    file.path.endsWith('.dsl.ts') && !file.imports.some((edge) => edge.to === contract)
      ? [
          {
            rule: 'dsl-on-driver',
            key: `dsl-on-driver:${file.path}`,
            file: file.path,
            line: 1,
            value: 1,
            message: `${file.path} imports nothing from ${contract}. Build its steps on the driver contract.`,
          },
        ]
      : [],
};

export default { rules: [dslOnDriver] } satisfies Plugin;
```

It loads like the plugin above, as `dsl: ./warp/dsl.ts` under `plugins`, and its rule is `dsl/dsl-on-driver`.

## What a rule reads

A rule reads facts, never source. Analysis extracts each file's facts once, and every rule reads the same ones.

A `FileRule` reads one file at a time, with the options that resolve for that file. Its `file` (`FileFacts`) holds:

| Field | Holds |
| --- | --- |
| `path`, `lines` | The file's path from the project root, and its length. |
| `imports` | Each `ImportEdge`, one import of a project file: `from`, `to`, `specifier`, `names`, `typeOnly`, `line`, `reExport` for a re-export, and `via` when it went through a barrel. `to` is the file that declares the names, and `names` are what it exports them as, `*` for a namespace. An import of values and types from one file is two edges, so `typeOnly` holds for each name. |
| `externals` | Each package import: `package`, `specifier`, `names`, `typeOnly`, `line`. |
| `unresolved` | Each relative import that resolves to no file: `specifier`, `line`. |
| `members` | The top-level declarations, such as `cartTotal`, and the links between those that use each other. The cohesion rules read it. |
| `functions` | Each function's statements and complexity. |
| `classes` | Each class's methods and fields, and the links between those that share state or call each other. |

A `ProjectRule`, with `scope: 'project'`, reads the whole project once. Its context holds:

| Field | Holds |
| --- | --- |
| `project` | Every file's facts. |
| `config` | The loaded config. |
| `model` | The modules, and each file's module through `moduleOf`. |
| `verdicts` | For each import between project files, whether the importer's reach allows it, with the grant that allows it or the reason it is refused. |
| `atFile`, `atModule` | The rule's setting for a file or a module, so the rule skips where it is off. |

The types are exported from `@yearofthedan/warp`, and [`src/builtins/`](../src/builtins) holds the built-in rules,
each a working example of one kind or the other.
