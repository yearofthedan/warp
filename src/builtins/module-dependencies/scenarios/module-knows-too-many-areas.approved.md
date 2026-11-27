Rule: a module is reported once its imports cross more boundaries than its limit, and a composition root turns it off.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
    rules: { module-dependencies: { max: 2 } }
  modules:
    domain: { dir: src/domain, exposes: all }
    icons: { dir: src/icons, exposes: all, ruleset: [warp:utility] }
    strings: { dir: src/strings, exposes: all, ruleset: [warp:utility] }
    ui: { dir: src/ui, dependencies: [domain, icons, strings], exposes: all }
    app:
      dir: src/app
      dependencies: [domain, icons, strings, ui]
      ruleset: { rules: { module-dependencies: off } }
```

```ts src/domain/order.ts
export interface Order {
  id: string;
}
```

```ts src/icons/icons.ts
export const cross = '×';
```

```ts src/strings/strings.ts
export const cancel = 'Cancel';
```

```ts src/ui/card.ts
import type { Order } from '../domain/order.ts';
import { cross } from '../icons/icons.ts';
import { cancel } from '../strings/strings.ts';
export const card = (order: Order) => `${cross} ${cancel} ${order.id}`;
```

```ts src/app/main.ts
import type { Order } from '../domain/order.ts';
import { cross } from '../icons/icons.ts';
import { cancel } from '../strings/strings.ts';
import { card } from '../ui/card.ts';
export const main = (order: Order) => [cross, cancel, card(order)];
```

```sh
warp check
```

```text stdout
src/ui/card.ts:1 [module-dependencies] src/ui imports across 3 boundaries: src/domain, src/icons and src/strings. Its limit here is 2. Split it along what each part depends on, or reach some of them through one module. A module meant to wire everything together, such as a composition root, turns module-dependencies off or raises its max.

By rule and module:
  module-dependencies  src/ui  1

1 finding
```
