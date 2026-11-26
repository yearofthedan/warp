Rule: the default ruleset turns a rule off for one module.

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
warp check
```

```text stdout
src/stray.ts:1 [unclassified] src/stray.ts is in no module of the root, so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.
src/domain/order.ts:1 [dependency-direction] src/domain/order.ts (root.domain src/domain) imports src/adapters/index.ts (root.adapters src/adapters), which is outside domain's reach. No declared path allows this: either the import or the structure is wrong.
src/domain/pricing.ts:1 [dependency-direction] src/domain/pricing.ts (root.domain src/domain) imports types from src/adapters/db/orderRepo.ts (root.adapters src/adapters), which is outside domain's reach. No declared path allows this: either the import or the structure is wrong.
src/adapters/index.ts:1 [no-double-export] src/adapters/index.ts (root.adapters src/adapters) re-exports src/adapters/db/orderRepo.ts (root.adapters src/adapters), and src/adapters exposes both, so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.
src/app/index.ts:1 [no-double-export] src/app/index.ts (root.app src/app) re-exports src/app/handle.ts (root.app src/app), and src/app exposes both, so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.
src/app/index.ts:2 [no-cross-module-reexport] src/app/index.ts (root.app src/app) re-exports Order from src/domain/order.ts (root.domain src/domain), so its importers reach src/domain through src/app. Have importers that need it use src/domain directly, give src/app its own type that hides it, or move it into src/app if src/app owns it.
src/adapters/db/orderRepo.ts:1 [no-cycle] src/adapters/db/orderRepo.ts, src/adapters/index.ts and src/domain/order.ts import each other in a loop: src/adapters/db/orderRepo.ts:1 imports src/domain/order.ts, src/adapters/index.ts:1 imports src/adapters/db/orderRepo.ts, src/domain/order.ts:1 imports src/adapters/index.ts. Break it at one of these imports: move what both need into a file they both import, or invert one import.
src/adapters/db/orderRepo.ts:1 [module-cycle] src/adapters and src/domain import each other in a loop: src/adapters -> src/domain (src/adapters/db/orderRepo.ts:1 imports src/domain/order.ts), src/domain -> src/adapters (src/domain/order.ts:1 imports src/adapters/index.ts, and 1 other import). Break it at one of these imports: move what both sides need into a module they both use, or turn module-cycle off on the module that holds them if they are meant to use each other.
src/app/handle.ts:1 [file-cohesion] src/app/handle.ts is 23 lines (tripwire 15) and its top-level code falls into 2 groups that share no calls, top-level state or types: [handle] (lines 3-10); [grade] (lines 12-23). Each group can move to its own file.
src/domain/pricing.ts:1 [file-cohesion] src/domain/pricing.ts is 17 lines (tripwire 15) and its top-level code falls into 3 groups that share no calls, top-level state or types: [rate, tax, gross] (lines 3-7); [label] (lines 9-11); [shout, banner] (lines 13-17). Each group can move to its own file.
src/app/handle.ts:3 [function-cohesion] Function handle in src/app/handle.ts:3 is 8 lines (tripwire 6) and its statements fall into 2 groups that share no locals: lines 4-6; lines 7-9. Each group can become its own function.
warp.yaml:5 [unused-declaration] root.adapters.dependencies names app, but nothing in src/adapters imports through it. Remove it.
warp.yaml:4 [unused-declaration] root.app exposes: all, but nothing outside src/app imports it. Remove it, or use the module where it is needed.

By rule and module:
  dependency-direction      src/domain    2
  unused-declaration        warp.yaml     2
  file-cohesion             src/app       1
  file-cohesion             src/domain    1
  function-cohesion         src/app       1
  module-cycle              src/adapters  1
  no-cross-module-reexport  src/app       1
  no-cycle                  src/adapters  1
  no-double-export          src/adapters  1
  no-double-export          src/app       1
  unclassified              (root)        1

13 findings
```
