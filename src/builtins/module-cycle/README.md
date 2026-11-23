# module-cycle

**Audience:** anyone reading a `module-cycle` finding, or setting the rule.
**Purpose:** what `module-cycle` reports, why, and its options.

Report each import between sibling modules that lies on a loop among them.

## Why

Modules that import each other are understood, tested and moved together, as one. Two layers loop when `ui` uses
`application` and any file in `application` reaches back into any file in `ui`, whichever files those are. Reporting
the loop at the level of modules shows it where the design says the boundary is.

## Rule details

For each module, the rule builds the graph of imports between its child modules and reports every edge that lies on a
loop, one finding per pair of modules, keyed `module-cycle:src/ui->src/application`. An import counts toward the pair of
modules it crosses between, just below the deepest module that holds both files, so the graph holds imports between
files inside different children; a module's own files belong to the module itself. An import is followed to the file its
specifier names.

The finding is on the importing module, at the first import that crosses, and its value is the number of file pairs
that cross. A loop that grows only adds findings or raises a value.

With this config, `domain` and `infra` loop when `src/domain/order.ts` imports `src/infra/db.ts`:

```ts
import { all, archetype, dir, exposes, using } from 'warp';

const app = archetype('app').contains((m) =>
  m.module('domain', dir('src/domain'), exposes(all())).module('infra', dir('src/infra'), using((s) => [s.domain])),
);
```

Fix it by moving what both need into a module they both use, or by having the inner module own an interface the outer one
implements. A known loop among the modules one selector finds, such as modules that use each other, is tolerated by turning
the rule off on the module that finds them: `.on(app.modules.plugins, { 'module-cycle': false })`.

## Options

- `types`: `'count'` (default) counts type-only imports, since a type couples two files as much as a value does;
  `'ignore'` leaves them out of the graph, for a loop that matters only at run time.
