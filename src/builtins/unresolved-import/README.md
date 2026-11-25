# unresolved-import

**Audience:** anyone reading an `unresolved-import` finding, or setting the rule.
**Purpose:** what `unresolved-import` reports, why, and how to fix it.

Report each relative import that resolves to no file.

## Why

Every other import rule judges an import by the file it reaches. An import that reaches no file is judged by none of
them, so a typo in a path would pass warp without a word. Reporting it keeps the import graph the rules read complete.

## Rule details

An import is judged when its specifier starts with `.` or `/`. It passes when TypeScript resolves it, or when a file
sits at the path it names, such as a stylesheet: `import './card.css'`. A package import is never judged here;
[`module-externals`](../module-externals/README.md) covers packages.

The rule reports one finding per file and specifier, keyed `unresolved-import:src/ui/card.test.ts->./crad.ts`. Its
value is 1.

## Example

```yaml
root:
  modules:
    ui: { dir: src/ui }

rulesets:
  default:
    extends: [warp:recommended]
```

Incorrect code, with no `src/ui/crad.ts` in the project:

```ts fragment
// src/ui/card.test.ts
import { card } from './crad.ts';
```

```text
src/ui/card.test.ts:1 [unresolved-import] ./crad.ts from src/ui/card.test.ts resolves to no file. Fix the path, or add the file it names.
```

Correct code:

```ts fragment
// src/ui/card.test.ts
import { card } from './card.ts';
```

## How to fix

Fix the path, or add the file it names.

## Options

None.

## When not to use it

When a build step generates the files these imports name, and warp runs before it. Turn the rule off for the modules
that import them.
