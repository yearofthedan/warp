Rule: each loop among files is reported once, at its first import.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries]
  modules:
    src: { dir: src }
```

```ts src/order.ts
import { price } from './price.ts';
export const order = (id: string) => ({ id, total: price(id) });
```

```ts src/price.ts
import { order } from './order.ts';
export const price = (id: string) => (order(id).id === '' ? 0 : 1);
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
