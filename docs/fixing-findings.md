# Fixing findings

**Audience:** anyone, person or agent, with a warp finding to fix.
**Purpose:** how to read a finding, and how to choose between changing the code and changing the config.

## Read the finding

```text
src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (app.utils src/utils) imports src/db/client.ts (app.db src/db), which is outside utils's reach: utils may use nothing. Add what holds src/db/client.ts to a using if the dependency is intended, or move the code.
```

| Part | Here | Means |
| --- | --- | --- |
| Location | `src/utils/slug.ts:1` | The file and line to change, for a code fix. |
| Rule | `[dependency-direction]` | The rule that reports it. Its page is in [the rules table](rules.md). |
| Each file's module | `(app.utils src/utils)` | The module's archetype and name, then its folder. |
| Why | `outside utils's reach: utils may use nothing` | What the config allows the importer. |
| Fixes | `Add … to a using …, or move the code.` | The config fix first, then the code fix. |

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
| [`dependency-direction`](../src/builtins/dependency-direction/README.md) | Import what the module exposes, or move the code. | Add the module to the importer's `using`, or widen what the target exposes. |
| [`module-externals`](../src/builtins/module-externals/README.md) | Move the package import into a module that lists it. | Add `pkg('name')` to the importer's `using`. |
| [`module-cycle`](../src/builtins/module-cycle/README.md), [`no-cycle`](../src/builtins/no-cycle/README.md) | Move what both sides need into a module or file they both use, or invert one import. | Turn `module-cycle` off on the module that holds modules meant to use each other. |
| [`no-double-export`](../src/builtins/no-double-export/README.md) | Delete the barrel's re-export. | Expose only the barrel. |
| [`no-cross-module-reexport`](../src/builtins/no-cross-module-reexport/README.md) | Have importers import the other module directly. | Move the other module inside the one that re-exports it. |
| [`file-cohesion`](../src/builtins/file-cohesion/README.md), [`function-cohesion`](../src/builtins/function-cohesion/README.md) | Split along the groups the message names. | Raise `maxLines` for the module. |
| [`cognitive-complexity`](../src/builtins/cognitive-complexity/README.md) | Return early, or extract the increments the message names. | Raise `max` for the module. |
| [`unused-declaration`](../src/builtins/unused-declaration/README.md) | Nothing: the config holds more than the code uses. | Remove the declaration. |

## Turn a rule off where it doesn't apply

A rule that doesn't fit one place, such as generated code, is turned off there in a [ruleset](config.md#rulesets),
and stays on everywhere else:

```ts fragment
  .on(app.modules.generated, 'off')
```

## Leave the baseline for later

On an existing codebase, `warp check` reports what was there before the config. `warp diff` reports only what a
change makes new or worse, so the baseline can be fixed one finding at a time.
