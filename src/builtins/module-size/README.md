# module-size

**Audience:** anyone reading a `module-size` finding, or setting the rule.
**Purpose:** what `module-size` reports, why, and how to fix it.

Report a module whose own files hold more lines than its limit.

## Why

[`file-cohesion`](../file-cohesion/README.md) and [`function-cohesion`](../function-cohesion/README.md) keep each file
and function in shape, and splitting a file to satisfy them leaves the module as big as before. A module that keeps
growing in small, tidy files is still holding more than one responsibility. This rule totals the module.

## Rule details

The rule adds up the lines of a module's own files, the ones no child module claims. Production files count, tests
don't.

```text
src/domain/
├── model/order.ts    60 ┐ src/domain/model: 110
├── model/price.ts    50 ┘
└── rules/rule.ts    150   src/domain/rules: 150
```

`src/domain` itself holds no files of its own, so it scores 0. A layer split into small modules has already done what
the rule asks.

The finding sits on the module's largest file. Its value is the total, and the message and `details` list each file's
lines, largest first.

## Example

```yaml
root:
  ruleset: { extends: [warp:cohesion], rules: { module-size: { max: 6 } } }
  modules:
    pricing: { dir: src/pricing, exposes: all }
    orders: { dir: src/orders, dependencies: [pricing] }
```

Incorrect code, 8 lines in `orders`:

```ts fragment
// src/orders/order.ts
import { price } from '../pricing/price.ts';
export interface Order {
  id: string;
  total: number;
}
export const cancel = (order: Order) => price(order.total);
```

```ts fragment
// src/orders/refund.ts
import type { Order } from './order.ts';
export const refund = (order: Order) => order.total;
```

```text
src/orders/order.ts:1 [module-size] src/orders holds 8 lines in its own files (limit 6): src/orders/order.ts 6, src/orders/refund.ts 2. Split it into modules that each hold one responsibility.
```

Correct code: `refund` becomes a module of its own, depending on `orders`.

```yaml
orders: { dir: src/orders, dependencies: [pricing], exposes: all }
refunds: { dir: src/refunds, dependencies: [orders] }
```

## How to fix

Split the module along its responsibilities, into sibling modules or into children of it.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `1000` | The most lines a module's own files may hold. |

## When not to use it

For generated code. Turn the rule off on that module.
