# function-cohesion

**Audience:** anyone reading a `function-cohesion` finding, or setting the rule.
**Purpose:** what `function-cohesion` reports, why, and how to fix it.

Flag a long function whose statements fall into unrelated groups.

## Why

A long function that does one thing step by step is often fine. A long function that does two unrelated things is
two functions, and each change to one makes the reader wade through the other. Statements that share no data are the
seam, so this rule reports where it is.

## Rule details

The same LCOM4 measure as [`file-cohesion`](../file-cohesion/README.md), inside a function. It groups the body's
statements, linking two when they share a parameter, a local or a `this.<member>`. Parameters count as shared, so
guard clauses stay attached to the code they guard. Statements that touch none of these are left out. A function is
checked once it is over `maxLines`.

The finding's value is the number of groups. Its `details` lists their line ranges.

## Example

With `maxLines: 4`, set in a ruleset as `rules: { function-cohesion: { maxLines: 4 } }`.

Incorrect code:

```ts fragment
// src/handle.ts
export function handle(order: Order, log: (line: string) => void) {
  const placed = place(order);
  const id = placed.id;
  log(`placed ${id}`);
  const started = Date.now();
  const elapsed = Date.now() - started;
  console.log(elapsed);
}
```

```text
src/handle.ts:1 [function-cohesion] Function handle in src/handle.ts:1 is 8 lines (tripwire 4) and its statements fall into 2 groups that share no locals: lines 2-4; lines 5-7. Each group can become its own function.
```

Correct code, the timing in a function of its own:

```ts fragment
// src/handle.ts
export function handle(order: Order, log: (line: string) => void) {
  const placed = place(order);
  log(`placed ${placed.id}`);
}

export function timed(run: () => void) {
  const started = Date.now();
  run();
  console.log(Date.now() - started);
}
```

## How to fix

Move each group the message names into a function of its own.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `maxLines` | `40` | The tripwire. A function is checked once it is longer. |

## When not to use it

For code where a long sequence of independent steps is the point, such as test setup or a migration script. Turn it
off for that module.
