Rule: a module is reported once its own files hold more lines than its limit.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
    rules: { module-size: { max: 6 } }
  modules:
    pricing: { dir: src/pricing, exposes: all }
    orders: { dir: src/orders, dependencies: [pricing] }
```

```ts src/orders/order.ts
import { price } from '../pricing/price.ts';
export interface Order {
  id: string;
  total: number;
}
export const cancel = (order: Order) => price(order.total);
```

```ts src/orders/refund.ts
import type { Order } from './order.ts';
export const refund = (order: Order) => order.total;
```

```ts src/pricing/price.ts
export const price = (total: number) => total;
```

```sh
warp check
```

```text stdout
src/orders/order.ts:1 [module-size] src/orders holds 8 lines in its own files (limit 6): src/orders/order.ts 6, src/orders/refund.ts 2. Split it into modules that each hold one responsibility.

By rule and module:
  module-size  src/orders  1

1 finding
```
