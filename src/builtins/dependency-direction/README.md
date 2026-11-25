# dependency-direction

**Audience:** anyone reading a `dependency-direction` finding, or setting the rule.
**Purpose:** what `dependency-direction` reports, why, and how to fix it.

Report each import outside the importer's [reach](../../../docs/concepts.md#reach).

## Why

Layers only protect anything if dependencies point one way. Once the domain imports an adapter, changing the
database means changing the domain, tests need the database, and the layers stop being separable. The direction is
cheap to keep and expensive to recover, so it is checked on every import.

## Rule details

`dependencies` are the only permission. A file may import the rest of its own module, and what its module's
`dependencies` name. Every other import of a project file is a finding, one per pair of files, keyed `dependency-direction:src/api/orders.ts->src/db/orders.ts`. Its value is the number of
names imported, so importing more across the same boundary is worse. Type-only imports count.

[config.md](../../../docs/config.md#reach) says how an import is judged, barrels included. The message says why the
import is outside the reach: the target is private to its module, the importer's `dependencies` lack it, or it is above
the importer. Then it gives the smallest change to the config that would load and let the import through, such as the
`dependencies` to extend, or importing what the target's module exposes instead. When no change to `dependencies`,
`test.provides`, `exposes` or `requires` allows it without a loop between modules, the message says so: the import or
the structure is wrong. Package imports
are [`module-externals`](../module-externals/README.md)'s.

## Example

```text
src/
├── api/orders.ts
├── db/orders.ts
└── domain/
    ├── order.ts
    └── pricing.ts
```

```yaml
root:
  modules:
    domain: { dir: src/domain, exposes: { files: [order.ts] } }
    db: { dir: src/db, exposes: all, dependencies: [domain] }
    api: { dir: src/api, dependencies: [domain] }

rulesets:
  default:
    extends: [warp:recommended]
```

Incorrect code:

```ts fragment
// src/api/orders.ts
import { price } from '../domain/pricing.ts'; // domain exposes only order.ts
import { save } from '../db/orders.ts'; // api's dependencies list only domain
```

```text
src/api/orders.ts:2 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/domain/pricing.ts (root.domain src/domain), which src/domain keeps private (it exposes { files: [order.ts] }). Import what src/domain exposes instead.
src/api/orders.ts:3 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/db/orders.ts (root.db src/db), which is outside api's reach. Add db to root.api.dependencies (warp.yaml:5), or move the code. (+1 more in reach)
```

Correct code:

```ts fragment
// src/api/orders.ts
import { order } from '../domain/order.ts';
```

## How to fix

If the dependency breaks the design, move the code, or import what the target module exposes. If the design has
changed, add the target's module to the importer's `dependencies`, or widen what the target exposes.

## Options

None. The config's `dependencies` and `exposes` set what the rule allows.

## When not to use it

For code with no direction to keep, such as scripts. Give its module `dependencies` that list what it may reach, or turn
the rule off for that module.

[`no-cross-module-reexport`](../no-cross-module-reexport/README.md) reports the file that re-exports another module's
file, where this rule reports each importer.
