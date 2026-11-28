Rule: a type-only import closes a loop, unless the rule is set to ignore types.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries]
  modules:
    src: { dir: src }
```

```ts src/order.ts
import type { Price } from './price.ts';
export type Order = { id: string; price: Price };
```

```ts src/price.ts
import type { Order } from './order.ts';
export type Price = { order: Order; amount: number };
```

```sh
warp check
```

```text stdout
src/order.ts:1 [no-cycle] src/order.ts and src/price.ts import each other in a loop: src/order.ts:1 imports src/price.ts, src/price.ts:1 imports src/order.ts. Break it at one of these imports: move what both need into a file they both import, or invert one import.

By rule and module:
  no-cycle  src  1

1 finding
```
