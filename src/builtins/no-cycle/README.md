# no-cycle

**Audience:** anyone reading a `no-cycle` finding, or setting the rule.
**Purpose:** what `no-cycle` reports, why, and how to fix it.

Report each loop among files.

## Why

Files that import each other load in an order that depends on who imports first, so a value can be undefined when
it is read. A loop also ties the files together: each changes and moves with the others.

## Rule details

The rule builds the graph of imports between the project's files and reports each loop once: a set of files that all
reach each other, keyed by them, `no-cycle:src/order.ts+src/price.ts`. An import is followed to the file its
specifier names. The message lists each import on the loop, and each is a site, a place to break it. `check` shows
the finding at the first, and [`diff`](../../../docs/diff.md#new-and-worse) at the import the change added. The value
is the number of imports on the loop.

## Example

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

```text
src/order.ts:1 [no-cycle] src/order.ts and src/price.ts import each other in a loop: src/order.ts:1 imports src/price.ts, src/price.ts:1 imports src/order.ts. Break it at one of these imports: move what both need into a file they both import, or invert one import.
```

Correct code: `price.ts` works from the id alone.

```ts fragment
// src/price.ts
export const price = (id: string) => (id === '' ? 0 : 1);
```

## How to fix

Move what both files need into a file they both import, or invert one import.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `types` | `'count'` | `'count'` counts type-only imports, since a type couples two files as much as a value does. `'ignore'` leaves them out, for a loop that matters only at run time. |

## When not to use it

For generated code whose files import each other by design. Turn the rule off for that module.
