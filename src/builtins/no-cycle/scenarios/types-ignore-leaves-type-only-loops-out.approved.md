Rule: with types: ignore, a loop closed only by type-only imports is not reported.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
    rules:
      no-cycle: { types: ignore }
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
No findings.
```
