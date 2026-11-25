# module-externals

**Audience:** anyone reading a `module-externals` finding, or setting the rule.
**Purpose:** what `module-externals` reports, why, and how to fix it.

Report each package a file imports that no `dependencies` in its reach lists.

## Why

A package is a dependency like any other, and the modules that may use it are part of the design: in a hexagon only the
adapters talk to the database driver, and only the tests import the test runner. Listing packages in `dependencies` makes
that a checked fact, so a module imports exactly the packages it lists.

## Rule details

A file's packages come from its module's `dependencies`. [config.md](../../../docs/config.md#reach) says what
counts as a package import, and [Names](../../../docs/config.md#names) how `npm:x` and `*` match.

The rule reports one finding per file and package, keyed `module-externals:src/domain/order.ts->pg`, on the first
import of it. Its value is the number of names imported.

## Example

```yaml
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    adapters: { dir: src/adapters, dependencies: [domain, npm:pg] }

rulesets:
  default:
    extends: [warp:recommended]
```

Incorrect code:

```ts fragment
// src/domain/order.ts
import { Pool } from 'pg';
```

```text
src/domain/order.ts:1 [module-externals] src/domain/order.ts (root.domain src/domain) imports pg, a package outside domain's reach. Add npm:pg to root.domain.dependencies (warp.yaml:3), or move the code.
```

Correct code:

```ts fragment
// src/adapters/db.ts
import { Pool } from 'pg';
```

## How to fix

Move the code that needs the package into a module that lists it, or add `npm:name` to the module's `dependencies` if
the dependency is intended.

## Options

None.

## When not to use it

For a module whose packages aren't part of the design, such as build scripts. Give it `'npm:*'` in its `dependencies`.
