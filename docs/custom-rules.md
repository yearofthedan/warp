# Custom rules

**Audience:** anyone writing a rule of their own for warp.
**Purpose:** how to add a rule as a plugin, and the facts and context a rule reads.

A project adds its own rules as plugins: objects with a `rules` list, imported in the config. Each plugin gets a
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

```ts
// warp.config.ts
import { all, archetype, defineConfig, exposes, files, ruleset, using } from '@yearofthedan/warp';
import local from './warp/rules.ts';

const app = archetype('app').contains((c) =>
  c
    .module('domain', files('src/domain/**'), exposes(all()))
    .module('application', files('src/application/**'), exposes(files('src/application/index.ts')).using((m) => [m.domain]))
    .module('ui', files('src/ui/**'), using((m) => [m.application, m.domain])),
);

const base = ruleset()
  .rules({ 'local/no-ports-through-application': false })
  .on(app.modules.ui, { 'local/no-ports-through-application': true });

export default defineConfig({ root: app, plugins: { local }, rulesets: { default: base } });
```

- The plugin's rules are on everywhere by default. This ruleset turns the rule off, then on for `ui` alone.
- Relative imports need their `.ts` extension, and an import of types alone must be `import type`, since Node strips
  types without resolving them.
- Types in the editor come from the `@yearofthedan/warp` dev dependency.
- `defaults` and `parseOptions` are optional: a rule without them takes no options. `wholeNumberOptions` and
  `ConfigError` are exported for writing `parseOptions`.
- A rule's findings get the namespaced `rule`, and keys prefixed with the namespace. They link to the rule's `docs`
  when it has one.
- `diff` caches findings by the config and every file it imports, so editing a rule redoes the base.

## What a rule reads

A rule reads facts, never source. Analysis extracts each file's facts once, and every rule reads the same ones.

A `FileRule` reads one file at a time, with the options that resolve for that file. Its `file` (`FileFacts`) holds:

| Field | Holds |
| --- | --- |
| `path`, `lines` | The file's path from the project root, and its length. |
| `imports` | Each `ImportEdge`, one import of a project file: `from`, `to`, `specifier`, `names`, `typeOnly`, `line`, `reExport` for a re-export, and `via` when it went through a barrel. |
| `externals` | Each package import: `package`, `specifier`, `names`, `typeOnly`, `line`. |
| `members` | The top-level declarations, such as `cartTotal`, and the links between those that use each other. The cohesion rules read it. |
| `functions` | Each function's statements and complexity. |

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
