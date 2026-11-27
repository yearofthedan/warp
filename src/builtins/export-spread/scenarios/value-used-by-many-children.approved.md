Rule: a module is reported once more of its children use one outside value than its limit, unless it ignores the exporter.

```yaml warp.yaml
root:
  ruleset: [warp:recommended]
  modules:
    domain: { dir: src/domain, exposes: all }
    strings: { dir: src/strings, exposes: all, ruleset: [warp:utility] }
    ui:
      dir: src/ui
      ruleset: { rules: { export-spread: { ignore: [src/strings] } } }
      modules:
        cart: { dir: cart, dependencies: [domain, strings] }
        orders: { dir: orders, dependencies: [domain, strings] }
        account: { dir: account, dependencies: [domain, strings] }
```

```ts src/domain/order.ts
export const cancelOrder = (id: string) => id;
```

```ts src/strings/strings.ts
export const strings = { cancel: 'Cancel' };
```

```ts src/ui/cart/cart.ts
import { cancelOrder } from '../../domain/order.ts';
import { strings } from '../../strings/strings.ts';
export const cart = (id: string) => `${strings.cancel} ${cancelOrder(id)}`;
```

```ts src/ui/orders/orders.ts
import { cancelOrder } from '../../domain/order.ts';
import { strings } from '../../strings/strings.ts';
export const orders = (id: string) => `${strings.cancel} ${cancelOrder(id)}`;
```

```ts src/ui/account/account.ts
import { cancelOrder } from '../../domain/order.ts';
import { strings } from '../../strings/strings.ts';
export const account = (id: string) => `${strings.cancel} ${cancelOrder(id)}`;
```

```sh
warp check
```

```text stdout
src/ui/account/account.ts:1 [export-spread] 3 of src/ui's modules use cancelOrder from src/domain: src/ui/account, src/ui/cart and src/ui/orders. Its limit here is 2. Give the use to the one module that should own it and let the others go through that module, or add src/domain to export-spread's ignore list on src/ui if it is meant to be shared.

By rule and module:
  export-spread  src/ui/account  1

1 finding
```
