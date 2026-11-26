Rule: model --rules shows each module's rule settings that differ from the defaults, under the ruleset named.

```yaml warp.yaml
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    app: { dir: src/app, dependencies: [domain], exposes: all }
    adapters: { dir: src/adapters, dependencies: [domain, app], exposes: all }

rulesets:
  default:
    extends: [warp:recommended]
    rules:
      file-cohesion: { maxLines: 15 }
      function-cohesion: { maxLines: 6 }
      cognitive-complexity: { max: 4 }
    on: { root.app: { cognitive-complexity: off } }
  edit:
    extends: [default]
    rules: { file-cohesion: { maxLines: 10 } }
    on: { root.app: { cognitive-complexity: on, function-cohesion: off } }
```

```json tsconfig.json
{
  "compilerOptions": { "target": "es2022", "module": "nodenext", "strict": true, "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src"]
}
```

```ts src/adapters/db/orderRepo.ts
import type { Order } from '../../domain/order.ts';

export interface OrderRow {
  id: string;
}

export const saveOrder = (order: Order): OrderRow => ({ id: order.id });
```

```ts src/adapters/index.ts
export * from './db/orderRepo.ts';
```

```ts src/app/handle.ts
import { place, type Order } from '../domain/order.ts';

export function handle(order: Order, log: (line: string) => void) {
  const placed = place(order);
  const id = placed.id;
  log(`placed ${id}`);
  const started = Date.now();
  const elapsed = Date.now() - started;
  console.log(elapsed);
}

export function grade(score: number, strict: boolean) {
  if (score > 90) {
    for (const n of [1, 2]) {
      if (strict && n > 1) return 'A+';
    }
    return 'A';
  } else if (score > 50 || strict) {
    return 'B';
  } else {
    return 'C';
  }
}
```

```ts src/app/index.ts
export { handle } from './handle.ts';
export { type Order } from '../domain/order.ts';
```

```ts src/domain/order.ts
import { saveOrder } from '../adapters/index.ts';
import type { OrderRow } from '../adapters/index.ts';

export interface Order {
  id: string;
}

export const place = (order: Order): OrderRow => saveOrder(order);
```

```ts src/domain/pricing.ts
import { type OrderRow } from '../adapters/db/orderRepo.ts';

const rate = 0.2;

export const tax = (amount: number) => amount * rate;

export const gross = (amount: number) => amount + tax(amount);

export function label(row: OrderRow) {
  return `order ${row.id}`;
}

export function shout(text: string) {
  return text.toUpperCase();
}

export const banner = (text: string) => shout(`** ${text} **`);
```

```ts src/stray.ts
export const stray = 1;
```

```sh
warp model --ruleset edit --rules
```

```text stdout
(root)  root: root
  rules: file-cohesion {"maxLines":10}, function-cohesion {"maxLines":6}, cognitive-complexity {"max":4}
  loose: src/stray.ts
  src/domain  domain: root.domain, 2 files
  src/app  app: root.app, 2 files
    rules: function-cohesion off
  src/adapters  adapters: root.adapters, 2 files

4 modules, 7 files, 1 loose.
```
