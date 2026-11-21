# unit-cycle

Report each import between sibling units that lies on a loop among them, in an archetype config.

## Why

Units that import each other are understood, tested and moved together, as one. Two layers loop when `ui` uses
`application` and any file in `application` reaches back into any file in `ui`, whichever files those are. Reporting
the loop at the level of units shows it where the design says the boundary is.

## Rule details

For each unit, the rule builds the graph of imports between its child units and reports every edge that lies on a
loop, one finding per pair of units, keyed `unit-cycle:src/ui->src/application`. An import counts toward the pair of
units it crosses between, just below the deepest unit that holds both files, so the graph holds imports between
files inside different children; a unit's own files belong to the unit itself. An import is followed to the file its
specifier names.

The finding is on the importing unit, at the first import that crosses, and its value is the number of file pairs
that cross. A loop that grows only adds findings or raises a value.

With this config, `domain` and `infra` loop when `src/domain/order.ts` imports `src/infra/db.ts`:

```ts
const app = archetype('app').contains((p) =>
  p.dir('domain', 'src/domain').dir('infra', 'src/infra', { using: (s) => [s.domain] }),
);
```

Fix it by moving what both need into a unit they both use, or by having the inner unit own an interface the outer one
implements. A known loop among a dir part's units, such as modules that use each other, is tolerated by turning the
rule off on that part: `.dir('modules', '{name}', module, { rules: { 'unit-cycle': false } })`.

## Options

- `types`: `'ignore'` (default) leaves type-only imports out of the graph, since they don't load at run time;
  `'count'` counts them.
