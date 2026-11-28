Rule: an exported value is reported once more boundaries use it than the exporter's limit, and a utility's exports are not.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:coupling]
    rules: { export-consumers: { max: 2 } }
  modules:
    domain: { dir: src/domain, exposes: all }
    strings: { dir: src/strings, exposes: all, ruleset: [warp:toolkit] }
    ui: { dir: src/ui, dependencies: [domain, strings] }
    jobs: { dir: src/jobs, dependencies: [domain, strings] }
    app: { dir: src/app, dependencies: [domain, strings] }
```

```ts src/domain/order.ts
export interface Order {
  id: string;
}
export const cancelOrder = (order: Order) => order.id;
```

```ts src/strings/strings.ts
export const strings = { cancel: 'Cancel' };
```

```ts src/ui/cart.ts
import { cancelOrder, type Order } from '../domain/order.ts';
import { strings } from '../strings/strings.ts';
export const cancel = (order: Order) => `${strings.cancel} ${cancelOrder(order)}`;
```

```ts src/jobs/expire.ts
import { cancelOrder, type Order } from '../domain/order.ts';
import { strings } from '../strings/strings.ts';
export const expire = (order: Order) => `${strings.cancel} ${cancelOrder(order)}`;
```

```ts src/app/main.ts
import { cancelOrder, type Order } from '../domain/order.ts';
import { strings } from '../strings/strings.ts';
export const main = (order: Order) => `${strings.cancel} ${cancelOrder(order)}`;
```

```sh
warp check
```

```text stdout
src/domain/order.ts:4 [export-consumers] cancelOrder, exported by src/domain, is used across 3 boundaries: src/app, src/jobs and src/ui. Its limit here is 2. Give its consumers one way in, or move it to a module meant to be shared and turn export-consumers off there.

By rule and module:
  export-consumers  src/domain  1

1 finding
```
