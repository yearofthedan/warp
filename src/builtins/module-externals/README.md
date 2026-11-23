# module-externals

**Audience:** anyone reading a `module-externals` finding, or setting the rule.
**Purpose:** what `module-externals` reports, why, and how to fix it.

Report each package a file imports that no `using` in its reach lists.

## Why

A package is a dependency like any other, and the modules that may use it are part of the design: in a hexagon only the
adapters talk to the database driver, and only the tests import the test runner. Listing packages in `using` makes
that a checked fact, so a module imports exactly the packages it lists.

## Rule details

A file's packages come from its module's `using` and, in a files module, its folder module's `using`.
[config.md](../../../docs/config.md#reach) says what counts as a package import and how `pkg()` matches.

The rule reports one finding per file and package, keyed `module-externals:src/domain/order.ts->pg`, on the first
import of it. Its value is the number of names imported.

## Example

```ts
import { all, archetype, defineConfig, dir, exposes, pkg, using } from '@yearofthedan/warp';

const app = archetype('app').contains((c) =>
  c
    .module('domain', dir('src/domain'), exposes(all()))
    .module('adapters', dir('src/adapters'), using((m) => [m.domain, pkg('pg')])),
);

export default defineConfig({ root: app });
```

Incorrect code:

```ts fragment
// src/domain/order.ts
import { Pool } from 'pg';
```

```text
src/domain/order.ts:1 [module-externals] src/domain/order.ts (app.domain src/domain) imports pg, a package outside domain's reach: no using in its reach lists a package. Add pkg('pg') to a using if the dependency is intended, or move the code.
```

Correct code:

```ts fragment
// src/adapters/db.ts
import { Pool } from 'pg';
```

## How to fix

Move the code that needs the package into a module that lists it, or add `pkg('name')` to the module's `using` if the
dependency is intended.

## Options

None.

## When not to use it

For a module whose packages aren't part of the design, such as build scripts. Give it `pkg('*')` in its `using`.
