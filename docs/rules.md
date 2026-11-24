# Rules

**Audience:** anyone choosing, setting or reading warp's rules.
**Purpose:** every built-in rule, and the fields of a finding.

A [ruleset](config.md#rulesets) sets each rule's options, or turns it off, by place. Each rule's page shows a config, code it reports with the finding it prints, code it passes, and
its options.

| Rule | Reports | Options |
| --- | --- | --- |
| [`unclassified`](../src/builtins/unclassified/README.md) | A loose file. On at the root module, off below, unless a ruleset says otherwise. | |
| [`unresolved-import`](../src/builtins/unresolved-import/README.md) | A relative import that resolves to no file. | |
| [`dependency-direction`](../src/builtins/dependency-direction/README.md) | An import outside the importer's reach. | |
| [`module-externals`](../src/builtins/module-externals/README.md) | A package import that no `using` in the importer's reach lists. | |
| [`no-double-export`](../src/builtins/no-double-export/README.md) | A re-export, in a file on its module's surface, of another file on that surface. | |
| [`module-cycle`](../src/builtins/module-cycle/README.md) | A loop among sibling modules. | `types` |
| [`no-cycle`](../src/builtins/no-cycle/README.md) | A loop among files. | `types` |
| [`no-cross-module-reexport`](../src/builtins/no-cross-module-reexport/README.md) | A re-export of another module's file, other than one nested in the re-exporting module. | |
| [`file-cohesion`](../src/builtins/file-cohesion/README.md) | A file over a size tripwire whose top-level code falls into unrelated groups (LCOM4). | `maxLines` |
| [`function-cohesion`](../src/builtins/function-cohesion/README.md) | A function over a size tripwire whose statements fall into unrelated groups. | `maxLines` |
| [`cognitive-complexity`](../src/builtins/cognitive-complexity/README.md) | A function harder to follow than `max`, by SonarSource's measure. | `max` |
| [`unused-declaration`](../src/builtins/unused-declaration/README.md) | A `using` entry, a surface or a module the code doesn't use. | |

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
  "message": "src/utils/slug.ts (app.utils src/utils) imports src/db/client.ts (app.db src/db), which is outside utils's reach: utils may use nothing. ...",
  "details": { "from": "src/utils", "to": "src/db", "reason": "not-in-using", "edges": ["..."] },
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
| `module` | The module of the finding's file, with `:tests` for a test file. |
| `sites` | For a finding with more than one place to fix it, such as a loop: each place. |
| `parts` | For a finding that can grow, such as a loop: what it is made of. |

The `claude-hook` and `omp` reporters list each rule's page once after the findings, and `sarif` gives it as the
rule's `helpUri`.
