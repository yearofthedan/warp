# dependency-direction

**Audience:** anyone reading a `dependency-direction` finding, or setting the rule.
**Purpose:** what `dependency-direction` reports, why, and its options.

Disallow imports outside the importer's reach.

## Why

Layers only protect anything if dependencies point one way. Once the domain imports an adapter, changing the
database means changing the domain, tests need the database, and the layers stop being separable. The direction is
cheap to keep and expensive to recover, so it is checked on every import.

## Rule details

`using` is the only permission. A file may import the rest of its own module, what its module's `using` names, and, in a
files module, what its folder module's `using` names. Anything else is a finding, one per
pair of files. Its value is the number of names imported, so importing more across the same boundary counts as
worse. Type-only imports count too.

An import is judged on the file its specifier names, not the file that declares the names, so a barrel a module exposes
lets importers through. The barrel's own re-exports are judged as its imports.

With this config:

```ts
import { all, archetype, defineConfig, dir, exposes, files, using } from '@yearofthedan/warp';

const app = archetype('app').contains((m) =>
  m
    .module('domain', dir('src/domain'), exposes(files('order.ts')))
    .module('db', dir('src/db'), exposes(all()).using((m) => [m.domain]))
    .module('api', dir('src/api'), using((m) => [m.domain])),
);

export default defineConfig({ root: app });
```

Incorrect code:

```ts fragment
// src/api/orders.ts
import { price } from '../domain/pricing.ts'; // domain exposes only order.ts
import { save } from '../db/orders.ts'; // api's using lists only domain
```

```
src/api/orders.ts:2 [dependency-direction] src/api/orders.ts (app.api src/api) imports src/domain/pricing.ts (app.domain src/domain), which src/domain keeps private (it exposes files('order.ts')). Import what src/domain exposes, or expose src/domain/pricing.ts from app.domain if other modules should reach it.
src/api/orders.ts:3 [dependency-direction] src/api/orders.ts (app.api src/api) imports src/db/orders.ts (app.db src/db), which is outside api's reach: app.api uses m.domain. Add what holds src/db/orders.ts to a using if the dependency is intended, or move the code.
```

Correct code:

```ts fragment
// src/api/orders.ts
import { order } from '../domain/order.ts';
```

The message says why: the module that keeps the target private and what it exposes instead, that the target is above
the importer, or what the importer's reach does hold. Package imports are judged by
[`module-externals`](../module-externals/README.md).

## Options

None. The config's `using` sets what it allows.

## When not to use it

For code with no direction to keep, such as scripts. Give its module a `using` that lists what it may reach, or turn
the rule off for that module.

See also [`no-cross-module-reexport`](../no-cross-module-reexport/README.md), which reports the file that re-exports
another module's file, where this rule reports each importer.
