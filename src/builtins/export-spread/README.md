# export-spread

**Audience:** anyone reading an `export-spread` finding, or setting the rule.
**Purpose:** what `export-spread` reports, why, and how to fix it.

Report a module more of whose children use one outside value than its limit.

## Why

When five components of `ui` each call `cancelOrder` from `domain`, `ui` orchestrates the domain from five places.
[`export-consumers`](../export-consumers/README.md) sees one consumer there, `ui`, since the use never leaves it. The
fix is in `ui`'s own config: give the use to the one child that should own it, and let the others go through that
child.

## Rule details

For each module with children, the rule counts, for each value exported from outside the module, the children whose
files use it. A child's own children count as the child.

```text
src/
├── domain/order.ts              exports cancelOrder, outside ui
└── ui/                          judged
    ├── cart/cart.ts             uses cancelOrder   src/ui/cart
    ├── cart/badge/badge.ts      uses cancelOrder   src/ui/cart again
    ├── orders/orders.ts         uses cancelOrder   src/ui/orders
    └── account/account.ts       uses cancelOrder   src/ui/account
```

`ui` spreads `cancelOrder` across 3 children.

- Values count, as for `export-consumers`. Type-only uses, tests and re-exports don't.
- Settings, the `ignore` list included, are read at the judged module. A list set high in the tree, or on an
  archetype's ruleset, reaches every module inside, and a lower setting replaces it.
- `ignore` names modules as [`dependencies`](../../../docs/config.md#rulesets) do, from where the ruleset is
  written: `ignore: [strings]` on `ui` is `ui`'s module `strings` if it has one, else the nearest `strings` above.
  Exports from those modules and their children don't count. A name not in scope fails to load.

The finding sits at the first use. Its value is the number of children, its `parts` name them, and its `details`
give the judged module, the exporter's module, the export, and the files in each child.

## Example

```yaml
root:
  ruleset: [warp:recommended]
  modules:
    domain: { dir: src/domain, exposes: all }
    strings: { dir: src/strings, exposes: all, ruleset: [warp:utility] }
    ui:
      dir: src/ui
      ruleset: { rules: { export-spread: { ignore: [strings] } } }
      modules:
        cart: { dir: cart, dependencies: [domain, strings] }
        orders: { dir: orders, dependencies: [domain, strings] }
        account: { dir: account, dependencies: [domain, strings] }
```

Incorrect code, each child calling the domain and the strings table:

```ts fragment
// src/ui/cart/cart.ts, src/ui/orders/orders.ts and src/ui/account/account.ts
import { cancelOrder } from '../../domain/order.ts';
import { strings } from '../../strings/strings.ts';
```

```text
src/ui/account/account.ts:1 [export-spread] 3 of src/ui's modules use cancelOrder from src/domain: src/ui/account, src/ui/cart and src/ui/orders. Its limit here is 2. Give the use to the one module that should own it and let the others go through that module, or name it in export-spread's ignore on src/ui if it is meant to be shared.
```

`strings` is ignored, so its three uses pass.

Correct code: `orders` owns cancelling, and the others call it.

```yaml
ui:
  dir: src/ui
  modules:
    orders: { dir: orders, dependencies: [domain], exposes: all }
    cart: { dir: cart, dependencies: [orders] }
    account: { dir: account, dependencies: [orders] }
```

## How to fix

Grant the exporter to the one child that should own the use, and have the others reach it through that child. If the
exporter is meant to be shared, add it to `ignore` on the module, or on a module above it.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `2` | The most children that may use one outside value. |
| `ignore` | `[]` | Modules, by name, whose exports don't count. |

## When not to use it

For a module whose children are plugins of one API, each meant to call it. List the API's module in `ignore`.
