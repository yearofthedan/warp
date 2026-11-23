# no-cycle

**Audience:** anyone reading a `no-cycle` finding, or setting the rule.
**Purpose:** what `no-cycle` reports, why, and its options.

Report each loop among files.

## Why

Files that import each other load in an order that depends on who imports first, so a value can be undefined when
it is read. A loop also ties the files together: each changes and moves with the others.

## Rule details

The rule builds the graph of imports between the project's files and reports each loop once: a set of files that all
reach each other, keyed by them, `no-cycle:src/order.ts+src/price.ts`. The message lists each import on the loop, and each
is a site, a place to break it. `check` shows the finding at the first, and
[`diff`](../../../docs/agents-and-ci.md#diff) at the import the change added. The value is the number of imports on
the loop. An import is followed to the
file its specifier names.

Incorrect code:

```ts fragment
// src/order.ts
import { price } from './price.ts';
export const order = (id: string) => ({ id, total: price(id) });
```

```ts fragment
// src/price.ts
import { order } from './order.ts';
export const price = (id: string) => (order(id).id === '' ? 0 : 1);
```

Fix it by moving what both need into a file they both import, or by inverting one import.

## Options

- `types`: `'count'` (default) counts type-only imports, since a type couples two files as much as a value does;
  `'ignore'` leaves them out of the graph, for a loop that matters only at run time.
