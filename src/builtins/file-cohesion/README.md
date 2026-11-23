# file-cohesion

**Audience:** anyone reading a `file-cohesion` finding, or setting the rule.
**Purpose:** what `file-cohesion` reports, why, and its options.

Flag a large file whose code falls into unrelated groups.

## Why

Size alone is a poor reason to split a file: cutting one cohesive file in two spreads one idea across two places.
A large file whose members share nothing is different. It is several files in one, so a reader has to load
all of it to change one part. This rule tells the two apart, and names the groups to split along.

## Rule details

The measure is LCOM4 over the file's top-level code. Functions and classes are the members. Two members are linked
when one references the other, or both reference the same top-level state or type declared in the file. Top-level
statements that declare nothing count together as one member. The file is checked only once it is over `maxLines`,
and passes at any size if its members form one connected group.

Incorrect code, over the tripwire:

```ts
const rate = 0.2;
export const tax = (n: number) => n * rate;
export const gross = (n: number) => n + tax(n);

export const shout = (s: string) => s.toUpperCase();
export const banner = (s: string) => `** ${shout(s)} **`;
```

Reported as two groups, `[rate, tax, gross]` and `[shout, banner]`, with their line ranges.

Correct code: the same groups in `pricing.ts` and `text.ts`, or one file whose functions all reach each other through
calls, shared state or shared types.

The finding's value is the number of groups, so a file that splits further counts as worse. Its `details` lists
each group's names and line range.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `maxLines` | `200` | The tripwire. Files at or under it are not checked. |

## When not to use it

For files that are lists by design, such as a set of independent helpers or a file of
constants. Raise `maxLines` for that module, or turn the rule off there.
