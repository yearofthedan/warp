# file-cohesion

**Audience:** anyone reading a `file-cohesion` finding, or setting the rule.
**Purpose:** what `file-cohesion` reports, why, and how to fix it.

Flag a large file whose code falls into unrelated groups.

## Why

Size alone is a poor reason to split a file: cutting one cohesive file in two spreads one idea across two places.
A large file whose members share nothing is different. It is several files in one, so a reader has to load
all of it to change one part. This rule tells the two apart, and names the groups to split along.

## Rule details

The measure is LCOM4 over the file's top-level code. Functions and classes are the members. Two members are linked
when one references the other, or both reference the same top-level state or type declared in the file. Top-level
statements that declare nothing count together as one member. The file is checked once it is over `maxLines`, and
passes at any size if its members form one connected group.

The finding's value is the number of groups, so a file that splits further is worse. Its `details` lists each
group's names and line range.

## Example

With `maxLines: 4`, set in a ruleset as `.rules({ 'file-cohesion': { maxLines: 4 } })`.

Incorrect code:

```ts fragment
// src/mixed.ts
const rate = 0.2;
export const tax = (n: number) => n * rate;
export const gross = (n: number) => n + tax(n);

export const shout = (s: string) => s.toUpperCase();
export const banner = (s: string) => `** ${shout(s)} **`;
```

```text
src/mixed.ts:1 [file-cohesion] src/mixed.ts is 6 lines (tripwire 4) and its top-level code falls into 2 groups that share no calls, top-level state or types: [rate, tax, gross] (lines 1-3); [shout, banner] (lines 5-6). Each group can move to its own file.
```

Correct code, one file per group:

```ts fragment
// src/pricing.ts
const rate = 0.2;
export const tax = (n: number) => n * rate;
export const gross = (n: number) => n + tax(n);
```

```ts fragment
// src/text.ts
export const shout = (s: string) => s.toUpperCase();
export const banner = (s: string) => `** ${shout(s)} **`;
```

## How to fix

Move each group the message names into a file of its own, or connect the groups if they are one idea.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `maxLines` | `200` | The tripwire. A file is checked once it is longer. |

## When not to use it

For files that are lists by design, such as a set of independent helpers or a file of constants. Raise `maxLines` for
that module, or turn the rule off there.
