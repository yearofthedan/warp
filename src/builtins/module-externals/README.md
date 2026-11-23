# module-externals

**Audience:** anyone reading a `module-externals` finding, or setting the rule.
**Purpose:** what `module-externals` reports, why, and its options.

Report each package a file imports that no `using` in its reach lists.

## Why

A package is a dependency like any other, and the modules that may use it are part of the design: in a hexagon only the
adapters talk to the database driver, and only the tests import the test runner. Listing packages in `using` makes
that a checked fact, so a module that lists none imports none.

## Rule details

A bare specifier that doesn't resolve to a project file is a package import, whether or not it resolves at all.
Its package is the specifier's first segment, or two for a scoped package, so `@aws-sdk/client-s3/commands` is
`@aws-sdk/client-s3`. A Node built-in is named with `node:` either way, so `fs/promises` is `node:fs`.

A file's packages come from its module's `using` and, in a files module, its folder module's `using`. `pkg('x')` lists a package by name or by specifier, and `*` matches any run of characters: `pkg('vitest')`
covers `vitest/config`, `pkg('node:*')` every built-in, and `pkg('*')` everything.

The rule reports one finding per file and package, keyed `module-externals:src/domain/order.ts->pg`, on the first
import of it. Its value is the number of names imported.

With this config, `src/domain/order.ts` may not import `pg`:

```ts
import { archetype, dir, pkg, using } from 'warp';

const app = archetype('app').contains((m) =>
  m.module('domain', dir('src/domain')).module('adapters', dir('src/adapters'), using((s) => [s.domain, pkg('pg')])),
);
```

Fix it by moving the code that needs the package into a module that lists it, or by adding the package to the module's
`using` if the dependency is intended.

## Options

None.
