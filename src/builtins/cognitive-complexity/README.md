# cognitive-complexity

**Audience:** anyone reading a `cognitive-complexity` finding, or setting the rule.
**Purpose:** what `cognitive-complexity` reports, why, and how to fix it.

Limit how hard a function is to follow.

## Why

Every branch, loop and break in flow is something a reader has to hold in their head, and nesting multiplies it.
Past a point, changes to the function get made without understanding all of it, which is where bugs come from.
Cognitive complexity counts that cost, so a nested `if` costs more than a flat `switch`.

## Rule details

SonarSource's cognitive complexity for each outermost function, with nested functions counted into it:

- `if`, ternaries, `switch`, loops and `catch` add 1 plus their nesting depth.
- `else`, `else if`, labelled jumps, each run of mixed `&&`/`||`/`??`, and direct recursion (a call that resolves to
  the function itself, `this.method()` included) add 1.

The finding's value is the total, and the message names the largest increments with their lines.

## Example

With `max: 4`, set in a ruleset as `.rules({ 'cognitive-complexity': { max: 4 } })`.

Incorrect code, a total of 10:

```ts fragment
export function grade(score: number, strict: boolean) {
  if (score > 90) {                  // +1
    for (const n of [1, 2]) {        // +2 (nesting 1)
      if (strict && n > 1) return 'A+'; // +3 (nesting 2), +1 for &&
    }
    return 'A';
  } else if (score > 50 || strict) { // +1, +1 for ||
    return 'B';
  } else {                           // +1
    return 'C';
  }
}
```

```text
src/grade.ts:1 [cognitive-complexity] Function grade in src/grade.ts:1 has cognitive complexity 10 (limit 4). The largest increments: if at line 4 (+3), for at line 3 (+2), if at line 2 (+1).
```

Correct code, a total of 3 for `grade` and 1 for `top`:

```ts fragment
const top = (strict: boolean) => (strict ? 'A+' : 'A');

export function grade(score: number, strict: boolean) {
  if (score > 90) return top(strict);
  if (score > 50 || strict) return 'B';
  return 'C';
}
```

## How to fix

Return early, move a nested block into a function of its own, or replace branches with a lookup. Start with the
increments the message names.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `15` | The highest total a function may have. |

## When not to use it

For generated code, or parsers and state machines whose shape follows a grammar. Raise `max` for that module rather
than turning the rule off.
