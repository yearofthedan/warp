# Rules

**Audience:** anyone choosing, setting or reading warp's rules.
**Purpose:** every built-in rule, and the fields of a finding.

A [ruleset](config.md#rulesets) on a module turns rules on or off and sets their options there and inside it. Each
rule's page shows a config, code it reports with the finding it prints, code it passes, and its options.

| Rule | Reports | Options |
| --- | --- | --- |
| [`unclassified`](../src/builtins/unclassified/README.md) | A loose file. | |
| [`unresolved-import`](../src/builtins/unresolved-import/README.md) | A relative import that resolves to no file. | |
| [`dependency-direction`](../src/builtins/dependency-direction/README.md) | An import outside the importer's reach. | |
| [`module-externals`](../src/builtins/module-externals/README.md) | A package import that no `dependencies` in the importer's reach lists. | |
| [`no-double-export`](../src/builtins/no-double-export/README.md) | A re-export, in a file on its module's surface, of another file on that surface. | |
| [`module-cycle`](../src/builtins/module-cycle/README.md) | A loop among sibling modules. | `types` |
| [`no-cycle`](../src/builtins/no-cycle/README.md) | A loop among files. | `types` |
| [`no-cross-module-reexport`](../src/builtins/no-cross-module-reexport/README.md) | A re-export of another module's file, other than one nested in the re-exporting module. | |
| [`file-cohesion`](../src/builtins/file-cohesion/README.md) | A file over a size tripwire whose top-level code falls into unrelated groups (LCOM4). | `maxLines` |
| [`class-cohesion`](../src/builtins/class-cohesion/README.md) | A class over a size tripwire whose stateful methods fall into groups that share no fields or calls (LCOM4). | `maxLines` |
| [`function-cohesion`](../src/builtins/function-cohesion/README.md) | A function over a size tripwire whose statements fall into unrelated groups. | `maxLines` |
| [`cognitive-complexity`](../src/builtins/cognitive-complexity/README.md) | A function harder to follow than `max`, by SonarSource's measure. | `max` |
| [`export-consumers`](../src/builtins/export-consumers/README.md) | An exported value used across more boundaries than `max`. | `max` |
| [`export-spread`](../src/builtins/export-spread/README.md) | A module more of whose children use one outside value than `max`. | `max`, `ignore` |
| [`export-surface`](../src/builtins/export-surface/README.md) | A module from which other modules import more names than `max`. | `max` |
| [`unused-declaration`](../src/builtins/unused-declaration/README.md) | A `dependencies` entry, a surface or a module the code doesn't use. | |

A project adds its own rules as plugins: see [custom-rules.md](custom-rules.md).

## Findings

A finding is one thing a rule reports. The `text` reporter prints its location, rule and message. The `json` reporter
gives every field:

```json
{
  "rule": "dependency-direction",
  "key": "dependency-direction:src/utils/slug.ts->src/db/client.ts",
  "file": "src/utils/slug.ts",
  "line": 1,
  "value": 1,
  "message": "src/utils/slug.ts (root.utils src/utils) imports src/db/client.ts (root.db src/db), which is outside utils's reach. ...",
  "details": { "from": "src/utils", "to": "src/db", "reason": "not-in-dependencies", "edges": ["..."] },
  "docs": "https://github.com/yearofthedan/warp/blob/main/src/builtins/dependency-direction/README.md",
  "module": "src/utils"
}
```

| Field | Holds |
| --- | --- |
| `rule` | The rule's id, `namespace/id` for a plugin rule. |
| `key` | What identifies the finding across commits. [diff.md](diff.md#new-and-worse) compares by it. |
| `file`, `line` | Where to look. |
| `value` | How much: names imported, groups, complexity. A higher value at the head is worse. |
| `limit` | For a rule with a threshold, the one the value passed. |
| `message` | What is wrong and how to fix it, in one line. |
| `details` | The same facts as data, for an agent or a tool. Each rule's page describes its own. |
| `docs` | The rule's page. |
| `module` | The module of the finding's file, a test module for a test file. |
| `sites` | For a finding with more than one place to fix it, such as a loop: each place. |
| `parts` | For a finding that can grow, such as a loop: what it is made of. |

The `claude-hook` and `omp` reporters list each rule's page once after the findings, and `sarif` gives it as the
rule's `helpUri`.
