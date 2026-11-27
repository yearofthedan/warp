# Fixing findings

**Audience:** anyone, person or agent, with a warp finding to fix.
**Purpose:** how to read a finding, and how to choose between changing the code and changing the config.

## Read the finding

```text
src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (root.utils src/utils) imports src/db/client.ts (root.db src/db), which is outside utils's reach. Add db to root.utils.dependencies (warp.yaml:4), or move the code.
```

| Part | Here | Means |
| --- | --- | --- |
| Location | `src/utils/slug.ts:1` | The file and line to change, for a code fix. |
| Rule | `[dependency-direction]` | The rule that reports it. Its page is in [the rules table](rules.md). |
| Each file's module | `(root.utils src/utils)` | The module's path from its archetype or the root, then its folder. |
| Why | `outside utils's reach` | Why the config refuses the import. |
| Fixes | `Add db to root.utils.dependencies (warp.yaml:4), or move the code.` | A config change that would let the import through, at its line in `warp.yaml`, then the code fix. When none exists, the message says the import or the structure is wrong. |

`diff` puts `new:` or `worse (was N):` in front of the line. The `json` reporter gives the same finding with `key`,
`value` and `details`, which [rules.md](rules.md#findings) describes.

## Decide: is the dependency intended?

A finding says the code and the config disagree. One of them is wrong.

- **The code is wrong** when the import breaks the design: the domain reaching a database client, a utility reaching
  into an API handler. Move the code that needs the dependency into a module that may have it, or pass the dependency
  in from outside.
- **The config is wrong** when the design has changed and the import is how it should be now. Change the config in
  the same change as the code, so the reviewer sees both.

For the finding above, `utils` reading the database is a design change, so the usual fix is in the code: `slug.ts`
takes the value it needs as a parameter, and `api` passes it in.

## Fixes by rule

| Rule | Fix in the code | Fix in the config |
| --- | --- | --- |
| [`unclassified`](../src/builtins/unclassified/README.md) | Move the file into a module's folder. | Add a module that matches it. |
| [`unresolved-import`](../src/builtins/unresolved-import/README.md) | Fix the path, or add the file it names. | Nothing: the code is wrong. |
| [`dependency-direction`](../src/builtins/dependency-direction/README.md) | Import what the module exposes, or move the code. | Add the module to the importer's `dependencies`, or widen what the target exposes. |
| [`module-externals`](../src/builtins/module-externals/README.md) | Move the package import into a module that lists it. | Add `npm:name` to the importer's `dependencies`. |
| [`module-cycle`](../src/builtins/module-cycle/README.md), [`no-cycle`](../src/builtins/no-cycle/README.md) | Move what both sides need into a module or file they both use, or invert one import. | Turn `module-cycle` off on the module that holds modules meant to use each other. |
| [`no-double-export`](../src/builtins/no-double-export/README.md) | Delete the barrel's re-export. | Expose only the barrel. |
| [`no-cross-module-reexport`](../src/builtins/no-cross-module-reexport/README.md) | Have importers import the other module directly. | Move the other module inside the one that re-exports it. |
| [`file-cohesion`](../src/builtins/file-cohesion/README.md), [`function-cohesion`](../src/builtins/function-cohesion/README.md) | Split along the groups the message names. | Raise `maxLines` for the module. |
| [`cognitive-complexity`](../src/builtins/cognitive-complexity/README.md) | Return early, or extract the increments the message names. | Raise `max` for the module. |
| [`unused-declaration`](../src/builtins/unused-declaration/README.md) | Nothing: the config holds more than the code uses. | Remove the declaration. |

## Turn a rule off where it doesn't apply

A rule that doesn't fit one place, such as generated code, is turned off there with a [ruleset](config.md#rulesets)
on that module, and stays on everywhere else:

```yaml fragment
generated: { dir: src/generated, ruleset: { rules: off } }
```

## Work through existing findings one at a time

On an existing codebase, `warp check` reports findings that were there before the config. Each is the same choice:
change the config, or fix the code. `warp diff` reports only what a change makes new or worse, so they can be settled
one at a time while new work stays checked.
