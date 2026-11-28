# export-surface

**Audience:** anyone reading an `export-surface` finding, or setting the rule.
**Purpose:** what `export-surface` reports, why, and how to fix it.

Report a module whose interface, as other modules use it, is wider than its limit.

## Why

Every name a caller has to know to use a module widens its interface: a function, a class, a constant or a type. A
wide interface means the module does many things for many callers, and each change to it reaches them. `exposes`
says which files other modules may import. This rule counts what they actually import, so it measures the interface
in use.

## Rule details

For each module, the rule counts the distinct names that files outside it import from files inside it. Values and
types count alike, and the message shows the split.

```text
src/domain/
├── model/order.ts    exports Order, cancel, Price
└── rules/rule.ts     imports Order, cancel, Price; exports run
src/app/main.ts       imports Order, cancel, run
```

`src/domain/model` counts 3 names: `Order`, `cancel` and `Price`, whoever imports them. `src/domain` counts the
names `app` imports from it, `Order`, `cancel` and `run`, also 3. What `rules` takes from `model` stays inside
`domain`.

- Every module is judged at its own boundary, parents included, against the limit in its own ruleset. A layer's
  count says the layer is wide, a different fix from one wide module inside it.
- Production files count. Tests and re-exports don't.
- A namespace import counts each member used through it, by the file that declares it: `orders.total()` counts
  `total`. A use in a type position isn't seen through a namespace.
- [`warp:toolkit`](../../../docs/config.md#rulesets) turns the rule off on a module meant to be shared, where
  offering many small helpers is the point.

The finding sits on the file with the most of those names. Its value is the number of names, and its `details` give
the module, the value and type counts, and the names by file.

## Example

```yaml
root:
  ruleset: { extends: [warp:coupling], rules: { export-surface: { max: 2 } } }
  modules:
    orders: { dir: src/orders, exposes: all }
    app: { dir: src/app, dependencies: [orders] }
```

Incorrect code, three names used from outside `orders`:

```ts fragment
// src/app/main.ts
import { cancel, refund, type Order } from '../orders/order.ts';
```

```text
src/orders/order.ts:1 [export-surface] src/orders offers 3 names that other modules use (2 values, 1 type). Its limit here is 2. Split it, or give it a smaller front.
```

Correct code: `orders` offers one entry point that takes what to do.

```ts fragment
// src/app/main.ts
import { settle } from '../orders/order.ts';
```

## How to fix

Split the module along the groups of names its callers use together, or put a smaller front on it. For a layer,
split it into modules each caller needs less of.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `20` | The most names other modules may import from the module. |

## When not to use it

For a module meant to be shared, such as strings or helpers. Put `ruleset: [warp:toolkit]` on it.
