# package-spread

**Audience:** anyone reading a `package-spread` finding, or setting the rule.
**Purpose:** what `package-spread` reports, why, and how to fix it.

Report a module more of whose children import one package than its limit.

## Why

When `billing`, `checkout` and `refunds` each import `stripe`, three modules hold the vendor directly. A change of
vendor, or of how it is called, is three changes, and each module carries its own idea of how to use it. The fix is
one module that wraps the package, which the others go through. `dependencies` can say the same by listing the
package on one module only, but `'npm:*'` lets every module import it, and this rule still counts. The same holds
for `node:fs` read from every feature instead of through one adapter.

## Rule details

For each module with children, the rule counts, for each package, the children whose files import it. A child's
own children count as the child.

```text
src/
└── features/                    judged
    ├── billing/pay.ts           imports stripe   src/features/billing
    ├── billing/invoice.ts       imports stripe   src/features/billing again
    ├── checkout/cart.ts         imports stripe   src/features/checkout
    └── refunds/refund.ts        imports stripe   src/features/refunds
```

`features` spreads `stripe` across 3 children.

- Packages count by name, so `stripe` and `stripe/types` are one package. `node:` built-ins and `virtual:` modules
  count too.
- Value imports count. Type-only imports, tests and re-exports don't.
- Settings, the `ignore` list included, are read at the judged module. A list set high in the tree, or on an
  archetype's ruleset, reaches every module inside, and a lower setting replaces it.
- `ignore` names packages as `dependencies` does, globs included: `ignore: [npm:zod, 'node:*']`.

The finding sits at the first import. Its value is the number of children, its `parts` name them, and its `details`
give the judged module, the package, and the files in each child.

## Example

```yaml
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

Incorrect code, each child importing the payment vendor and the validation library:

```ts fragment
// src/features/billing/pay.ts, src/features/checkout/cart.ts and src/features/refunds/refund.ts
import Stripe from 'stripe';
import { z } from 'zod';
```

```text
src/features/billing/pay.ts:1 [package-spread] 3 of src/features's modules import stripe: src/features/billing, src/features/checkout and src/features/refunds. Its limit here is 2. Wrap stripe in the one module that should own it and let the others go through that module, or name npm:stripe in package-spread's ignore on src/features if it is meant to be used everywhere.
```

`zod` is ignored, so its three imports pass.

Correct code: `payments` wraps `stripe`, and the others call it.

```yaml
features:
  dir: src/features
  modules:
    payments: { dir: payments, dependencies: [npm:stripe], exposes: all }
    billing: { dir: billing, dependencies: [payments, npm:zod] }
    checkout: { dir: checkout, dependencies: [payments, npm:zod] }
    refunds: { dir: refunds, dependencies: [payments, npm:zod] }
```

## How to fix

Move the package's imports into the one module that should own them, and have the others call that module. If the
package is meant to be used everywhere, such as a validation or date library, add it to `ignore` on the module, or on
a module above it.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `2` | The most children that may import one package. |
| `ignore` | `[]` | Packages, as `dependencies` names them, that don't count. |

## When not to use it

For a layer of adapters, whose children each wrap the outside world and so import the same packages, such as
`node:fs`. Turn the rule off on that layer: `adapters: { dir: src/adapters, ruleset: { rules: { package-spread: off } } }`.
