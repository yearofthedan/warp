Rule: a module is reported once more names, values and types, are imported from outside it than its limit, and a utility is not.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
    rules: { export-surface: { max: 2 } }
  modules:
    orders: { dir: src/orders, exposes: all }
    strings: { dir: src/strings, exposes: all, ruleset: [warp:utility] }
    app: { dir: src/app, dependencies: [orders, strings] }
```

```ts src/orders/order.ts
export interface Order {
  id: string;
}
export const cancel = (order: Order) => order.id;
export const refund = (order: Order) => order.id;
```

```ts src/strings/strings.ts
export const cancelled = 'Cancelled';
export const refunded = 'Refunded';
export const title = 'Orders';
```

```ts src/app/main.ts
import { cancel, refund, type Order } from '../orders/order.ts';
import { cancelled, refunded, title } from '../strings/strings.ts';
export const main = (order: Order) => [title, cancelled, cancel(order), refunded, refund(order)];
```

```sh
warp check
```

```text stdout
src/orders/order.ts:1 [export-surface] src/orders offers 3 names that other modules use (2 values, 1 type). Its limit here is 2. Split it, or give it a smaller front.

By rule and module:
  export-surface  src/orders  1

1 finding
```
