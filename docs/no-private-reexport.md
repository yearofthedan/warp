# no-private-reexport

**Audience:** anyone reading a `no-private-reexport` finding, or setting the rule.
**Purpose:** what `no-private-reexport` reports, why, and its options.

Report each re-export, in a file on its unit's surface, of a file the unit keeps private, in an archetype config.

## Why

An import is judged on the file its specifier names, so a file on a surface passes on everything it re-exports. If
that file re-exports a private one, the unit offers more than `.exposes()` says, and the config no longer describes
the code.

## Rule details

A file is on its unit's surface when the unit exposes it. Each of its re-exports, `export ... from` or an imported
name exported again, must name a file the unit also exposes. A re-export of a file outside the unit, or of a package,
is not this rule's concern.

The rule reports one finding per pair of files, keyed `no-private-reexport:src/domain/index.ts->src/domain/order.ts`,
on the first re-export. Its value is the number of names re-exported.

With this archetype, `index.ts` may not re-export `order.ts`:

```ts
import { archetype } from 'warp';

const layer = archetype('layer')
  .contains((p) => p.files('src', '**').files('index', 'index.ts', { using: (s) => [s.src] }))
  .exposes((s) => ({ api: s.index }));
```

```ts fragment
// src/domain/index.ts
export { order } from './order.ts';
```

Fix it by exposing what the file re-exports, or by re-exporting only exposed files. An archetype whose surface is a
barrel over private files says so by turning the rule off: `.rules({ 'no-private-reexport': false })`.

## Options

None.
