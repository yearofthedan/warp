# export-consumers

**Audience:** anyone reading an `export-consumers` finding, or setting the rule.
**Purpose:** what `export-consumers` reports, why, and how to fix it.

Report an exported value used across more boundaries than its module allows.

## Why

A function, class or constant that every layer calls is behaviour every layer depends on: changing it reaches them
all, and each caller holds a piece of the orchestration. For a utility such as a strings table that is the point. For
a domain function it usually means callers skip the one way in that should front it. The limit sits on the exporter,
so each kind of module says how widely its exports may be used.

## Rule details

The rule counts, for each exported value, the boundaries its consumers sit behind, as the exporter sees them. Each
consumer collapses to the module just below the nearest module it shares with the exporter:

```text
src/
├── domain/order.ts       exports cancelOrder
├── ui/
│   ├── cart/cart.ts      uses cancelOrder ─┐ one boundary: src/ui
│   └── orders/orders.ts  uses cancelOrder ─┘
├── jobs/expire.ts        uses cancelOrder    src/jobs
└── app/main.ts           uses cancelOrder    src/app
```

`cancelOrder` has 3 consumers. Splitting `ui` into more modules doesn't change the count; how many of `ui`'s modules
use it is [`export-spread`](../export-spread/README.md)'s question.

- Values count: functions, classes, constants. A type-only use doesn't, since domain types are meant to be used
  widely.
- Production files count. Tests and re-exports don't.
- An import is counted by the name its declaring file exports, through any barrel.
- Settings are read at the exporter's module. [`warp:utility`](../../../docs/config.md#rulesets) turns the rule off
  there.

The finding sits on the export's declaration. Its value is the number of boundaries, its `parts` name them, and its
`details` give the exporter's module, the name, and the files behind each boundary.

## Example

```yaml
root:
  ruleset: { extends: [warp:recommended], rules: { export-consumers: { max: 2 } } }
  modules:
    domain: { dir: src/domain, exposes: all }
    ui: { dir: src/ui, dependencies: [domain] }
    jobs: { dir: src/jobs, dependencies: [domain] }
    app: { dir: src/app, dependencies: [domain] }
```

Incorrect code, `cancelOrder` called from three layers:

```ts fragment
// src/domain/order.ts
export const cancelOrder = (order: Order) => order.id;
```

```ts fragment
// src/ui/cart.ts, src/jobs/expire.ts and src/app/main.ts
import { cancelOrder } from '../domain/order.ts';
```

```text
src/domain/order.ts:4 [export-consumers] cancelOrder, exported by src/domain, is used across 3 boundaries: src/app, src/jobs and src/ui. Its limit here is 2. Give its consumers one way in, or move it to a module meant to be shared and turn export-consumers off there.
```

Correct code: one use case fronts the domain, and the layers call it.

```ts fragment
// src/application/orders.ts
import { cancelOrder } from '../domain/order.ts';
export const cancel = (id: string) => cancelOrder(load(id));
```

## How to fix

Give the consumers one way in, such as an application use case, and narrow who reaches the exporter. If the module
is meant to be shared, put `ruleset: [warp:utility]` on it.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `3` | The most boundaries an exported value may be used across. |

## When not to use it

For a module whose exports are meant to be used everywhere, such as a strings table or shared helpers. Put
`ruleset: [warp:utility]` on that module.
