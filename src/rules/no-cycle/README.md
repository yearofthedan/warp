# no-cycle

**Audience:** anyone reading a `no-cycle` finding, or setting the rule.
**Purpose:** what `no-cycle` reports, why, and its options.

Report each import between files that lies on a loop.

## Why

Files that import each other load in an order that depends on who imports first, so a value can be undefined when
it is read. A loop also ties the files together: each changes and moves with the others.

## Rule details

The rule builds the graph of imports between the project's files and reports every edge that lies on a loop, one
finding per pair of files, keyed `no-cycle:src/a.ts->src/b.ts`. The message shows the shortest loop through the
edge. An import is followed to the file its specifier names.

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

- `types`: `'ignore'` (default) leaves type-only imports out of the graph, since they don't load at run time;
  `'count'` counts them.
