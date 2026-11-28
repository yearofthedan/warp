# module-dependencies

**Audience:** anyone reading a `module-dependencies` finding, or setting the rule.
**Purpose:** what `module-dependencies` reports, why, and how to fix it.

Report a module whose imports cross more boundaries than its limit.

## Why

Each area a module imports from is one more thing it knows about and one more reason for it to change. A module that
reaches into many areas is usually doing several jobs, or orchestrating what one module in front of those areas
should. Counting boundaries rather than files keeps the count steady when a dependency splits into more files or
modules.

## Rule details

For each module, the rule counts the boundaries its files' imports cross, as the module sees them. Each imported file
collapses to the module just below the nearest module it shares with the importer:

```text
src/
├── domain/order.ts, domain/rules/rule.ts   one boundary: src/domain
├── icons/icons.ts                          src/icons
└── ui/
    ├── card/card.ts                        imports domain/order.ts, domain/rules/rule.ts, icons/icons.ts
    └── page.ts                             imports card/card.ts, inside ui
```

`src/ui` and `src/ui/card` each cross 2 boundaries: `src/domain` and `src/icons`.

- Every module is judged at its own boundary, parents included, against the limit in its own ruleset.
- Type-only imports count: knowing an area's types is knowing the area.
- `import { a, b, c }` from one file counts once. How many names cross is
  [`export-surface`](../export-surface/README.md)'s measure.
- Production files count. Tests don't, and neither do packages.
- `ignore` names modules whose imports don't count, as [`dependencies`](../../../docs/config.md#rulesets) do, from
  where the ruleset is written. Set it high in the tree or on an archetype for utilities every module uses, such as
  icons or strings.

The finding sits at the first import by path. Its value is the number of boundaries, its `parts` name them, and its
`details` give the files behind each.

## Example

```yaml
root:
  ruleset: { extends: [warp:coupling], rules: { module-dependencies: { max: 2 } } }
  modules:
    domain: { dir: src/domain, exposes: all }
    icons: { dir: src/icons, exposes: all }
    strings: { dir: src/strings, exposes: all }
    ui: { dir: src/ui, dependencies: [domain, icons, strings], exposes: all }
    app:
      dir: src/app
      dependencies: [domain, icons, strings, ui]
      ruleset: { rules: { module-dependencies: off } }
```

Incorrect code, `ui` reaching into three areas:

```ts fragment
// src/ui/card.ts
import type { Order } from '../domain/order.ts';
import { cross } from '../icons/icons.ts';
import { cancel } from '../strings/strings.ts';
```

```text
src/ui/card.ts:1 [module-dependencies] src/ui imports across 3 boundaries: src/domain, src/icons and src/strings. Its limit here is 2. Split it along what each part depends on, or reach some of them through one module. A module meant to wire everything together, such as a composition root, turns module-dependencies off or raises its max.
```

`app` imports four areas, but it is the composition root, so the rule is off there.

Correct code: `ui` ignores the utilities it shares with every component.

```yaml
ui:
  dir: src/ui
  dependencies: [domain, icons, strings]
  ruleset: { rules: { module-dependencies: { ignore: [icons, strings] } } }
```

## How to fix

Split the module along what each part depends on, or put one module in front of several areas it reaches. For
utilities every module uses, name them in `ignore` high in the tree.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `4` | The most boundaries a module's imports may cross. |
| `ignore` | `[]` | Modules, by name, whose imports don't count. |

## When not to use it

For a composition root, which wires everything together: write `module-dependencies: off`, or a higher `max`, in its
ruleset.
