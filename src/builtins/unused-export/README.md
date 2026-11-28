# unused-export

**Audience:** anyone reading an `unused-export` finding, or setting the rule.
**Purpose:** what `unused-export` reports, why, and how to fix it.

Report a name a module offers on its surface that no other module imports.

## Why

A module's entry is its API. A name exported there reads as something other modules may call, so each one is a
promise to keep it working and a way in that a new caller can take without anyone deciding it. When no other module
imports the name, the promise has no callers. Taking it off the entry keeps the API what the code uses, and leaves the
name free to change inside the module.

## Rule details

The rule judges each module whose surface is a set of files it chose: an `entry`, or `exposes: { files: [...] }`. For
each name a surface file of the module's own exports, it looks for a production file outside the module that imports
it.

```text
src/billing/                       entry: index.ts
├── index.ts                       exports refund, reissue
├── refund.ts                      declares refund, reissue
└── audit.ts                       imports reissue   inside billing, doesn't count
src/ui/page.ts                     imports refund    from outside, counts
```

`reissue` is on `billing`'s surface, and nothing outside `billing` imports it.

- A use is matched to the declaration, through any barrel, so a name re-exported under another name counts as used
  when either name is imported.
- A namespace import, `import * as billing from '../billing/index.ts'`, counts as a use of every name the file exports.
- Type-only imports count. Tests don't, since a name only tests import is not part of the API.
- A module with `exposes: all` isn't judged: every file is its surface, so its own files export to each other.
- The root's surface, and the `entry` of a module directly below the root, are what the project offers its own users,
  so they aren't judged, as in [`unused-declaration`](../unused-declaration/README.md).
- Names that a surface file passes on with `export * from` aren't judged.

The finding sits at the line that exports the name. Its `details` give the module, the name, and the file and name of
its declaration.

## Example

```yaml
root:
  ruleset: [warp:boundaries]
  modules:
    app:
      dir: src
      modules:
        billing: { dir: billing, entry: index.ts }
        ui: { dir: ui, dependencies: [billing] }
```

Incorrect code, an entry that exports a name only `billing` uses:

```ts fragment
// src/billing/index.ts
export { refund, reissue } from './refund.ts';
```

```text
src/billing/index.ts:1 [unused-export] src/billing/index.ts exports reissue on src/billing's surface, but nothing outside src/billing imports it. Stop exporting it from src/billing/index.ts, or keep the file off the surface.
```

Correct code: the entry exports what other modules import.

```ts fragment
// src/billing/index.ts
export { refund } from './refund.ts';
```

## How to fix

Remove the name from the surface file's exports. Files inside the module still import it from the file that declares
it. If the name is declared in the surface file itself, move it to a file off the surface, or stop exporting it.

## Options

None.

## When not to use it

For a module whose surface is meant for callers outside the project, such as a library's public API below the top
level. Turn the rule off on that module.
