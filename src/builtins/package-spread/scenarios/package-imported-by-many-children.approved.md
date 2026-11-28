Rule: a module is reported once more of its children import one npm package than its limit, unless it ignores the package.

```yaml warp.yaml
root:
  ruleset: [warp:coupling]
  modules:
    features:
      dir: src/features
      ruleset: { rules: { package-spread: { ignore: [npm:zod] } } }
      modules:
        billing: { dir: billing, dependencies: ['npm:*'] }
        checkout: { dir: checkout, dependencies: ['npm:*'] }
        refunds: { dir: refunds, dependencies: ['npm:*'] }
```

```ts src/features/billing/pay.ts
import Stripe from 'stripe';
import { z } from 'zod';
export const pay = (key: string) => [new Stripe(key), z.string()];
```

```ts src/features/checkout/cart.ts
import Stripe from 'stripe';
import { z } from 'zod';
export const cart = (key: string) => [new Stripe(key), z.string()];
```

```ts src/features/refunds/refund.ts
import Stripe from 'stripe';
import { z } from 'zod';
export const refund = (key: string) => [new Stripe(key), z.string()];
```

```sh
warp check
```

```text stdout
src/features/billing/pay.ts:1 [package-spread] 3 of src/features's modules import stripe: src/features/billing, src/features/checkout and src/features/refunds. Its limit here is 2. Wrap stripe in the one module that should own it and let the others go through that module, or name npm:stripe in package-spread's ignore on src/features if it is meant to be used everywhere.

By rule and module:
  package-spread  src/features/billing  1

1 finding
```
