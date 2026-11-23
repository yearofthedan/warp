# module-cycle

**Audience:** anyone reading a `module-cycle` finding, or setting the rule.
**Purpose:** what `module-cycle` reports, why, and its options.

Report each loop among sibling modules.

## Why

Modules that import each other are understood, tested and moved together, as one. Two layers loop when `ui` uses
`application` and any file in `application` reaches back into any file in `ui`, whichever files those are. Reporting
the loop at the level of modules shows it where the design says the boundary is.

## Rule details

For each module, the rule builds the graph of imports between its child modules and reports each loop once: a set
of children that all reach each other, keyed by them, `module-cycle:src/application+src/ui`. An import counts toward
the pair of modules it crosses between, just below the deepest module that holds both files, so the graph holds
imports between files inside different children; a module's own files belong to the module itself. An import is
followed to the file its specifier names.

The message names each pair of modules on the loop with one of its imports. Every crossing import is a site, a place
to break the loop. `check` shows the finding at the first site by path, and [`diff`](../../../docs/agents-and-ci.md#diff)
at the import the change added. The value is the number of file pairs that cross, so a loop that gains an import or
a module is worse.

With this config, `domain` and `infra` loop when `src/domain/order.ts` imports `src/infra/db.ts`:

```ts
import { all, archetype, dir, exposes, using } from '@yearofthedan/warp';

const app = archetype('app').contains((m) =>
  m.module('domain', dir('src/domain'), exposes(all())).module('infra', dir('src/infra'), using((m) => [m.domain])),
);
```

Fix it by moving what both need into a module they both use, or by having the inner module own an interface the outer one
implements. A known loop among the modules one selector finds, such as modules that use each other, is tolerated by turning
the rule off on the module that finds them: `.on(app.modules.plugins, { 'module-cycle': false })`.

## Options

- `types`: `'count'` (default) counts type-only imports, since a type couples two files as much as a value does;
  `'ignore'` leaves them out of the graph, for a loop that matters only at run time.
