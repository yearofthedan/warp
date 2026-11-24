# module-cycle

**Audience:** anyone reading a `module-cycle` finding, or setting the rule.
**Purpose:** what `module-cycle` reports, why, and how to fix it.

Report each loop among sibling modules.

## Why

Modules that import each other are understood, tested and moved together, as one. Two layers loop when `ui` uses
`application` and any file in `application` reaches back into any file in `ui`, whichever files those are. Reporting
the loop at the level of modules shows it where the design says the boundary is.

## Rule details

For each module, the rule builds the graph of imports between its children and reports each loop once, keyed by the
modules on it: `module-cycle:src/domain+src/infra`. An import counts toward the two children of the deepest module
that holds both files:

```text
src/
├── domain/order.ts     ─┐ imports infra/db.ts: domain → infra
└── infra/
    ├── db.ts           ─┘ imports domain/order.ts: infra → domain
    └── pool/pool.ts       an import from here counts as infra → domain too
```

A module's own files belong to the module itself. Production imports count, and the imports of test modules are left out.

Every crossing import is a site, a place to break the loop. `check` shows the finding at the first site by path, and
[`diff`](../../../docs/diff.md#new-and-worse) at the import the change added. The value is the number of file pairs
that cross, so a loop that gains an import or a module is worse.

## Example

```ts
import { all, archetype, defineConfig, dir, exposes, using } from '@yearofthedan/warp';

const app = archetype('app').contains((c) =>
  c.module('domain', dir('src/domain'), exposes(all())).module('infra', dir('src/infra'), using((m) => [m.domain])),
);

export default defineConfig({ root: app });
```

Incorrect code:

```ts fragment
// src/domain/order.ts
import { connect } from '../infra/db.ts';
```

```ts fragment
// src/infra/db.ts
import { order } from '../domain/order.ts';
```

```text
src/domain/order.ts:1 [module-cycle] src/domain and src/infra import each other in a loop: src/domain -> src/infra (src/domain/order.ts:1 imports src/infra/db.ts), src/infra -> src/domain (src/infra/db.ts:1 imports src/domain/order.ts). Break it at one of these imports: move what both sides need into a module they both use, or turn module-cycle off on the module that holds them if they are meant to use each other.
```

Correct code: `domain` owns the interface, and `infra` implements it.

```ts fragment
// src/domain/order.ts
export interface Orders {
  save(order: Order): void;
}
```

```ts fragment
// src/infra/db.ts
import type { Orders } from '../domain/order.ts';
```

## How to fix

Move what both sides need into a module they both use, or have the inner module own an interface the outer one
implements.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `types` | `'count'` | `'count'` counts type-only imports, since a type couples two modules as much as a value does. `'ignore'` leaves them out, for a loop that matters only at run time. |

## When not to use it

For modules that are meant to use each other, such as plugins. Turn the rule off on the module that holds them:
`.on(app.modules.plugins, { 'module-cycle': false })`.
