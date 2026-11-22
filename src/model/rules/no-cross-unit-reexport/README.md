# no-cross-unit-reexport

**Audience:** anyone reading a `no-cross-unit-reexport` finding, or setting the rule.
**Purpose:** what `no-cross-unit-reexport` reports, why, and its options.

Disallow re-exporting another unit's files.

## Why

A file that re-exports another unit's names turns its unit into a door to that unit. Importers then reach the other
unit without importing it, so the dependency is hidden from anyone reading their imports. `dependency-direction`
already refuses a re-export the unit may not import. This rule reports passing on what the unit may use, in the one
file where the leak starts.

## Rule details

A re-export is `export { x } from`, `export * from`, `export * as ns from`, or an imported name exported again with
`export { x }` or `export default x`. Type-only re-exports count. Each is judged on the file its specifier names.

A unit owns its own files and the units nested in it, so a barrel over its own parts or its children's surfaces
passes. A re-export of a sibling's, an ancestor's or a provided unit's file is a finding.

With this archetype:

```ts
import { archetype } from 'warp';

const app = archetype('app').contains((p) =>
  p
    .dir('domain', 'src/domain')
    .dir('ports', 'src/ports', { using: (s) => [s.domain] })
    .dir('application', 'src/application', { using: (s) => [s.domain, s.ports] }),
);
```

Incorrect code:

```ts fragment
// src/application/project.ts
export { type ProjectsFolder } from '../ports/projects-folder.ts';
```

```ts fragment
// src/application/index.ts
export * from '../domain/order.ts';
```

Correct code:

```ts fragment
// src/application/index.ts: a barrel over its own unit
export { openProject } from './project.ts';
```

```ts fragment
// src/application/project.ts: uses the port without passing it on
import type { ProjectsFolder } from '../ports/projects-folder.ts';

export const openProject = (folder: ProjectsFolder, name: string) => folder.open(name);
```

There is one finding per pair of files, keyed `no-cross-unit-reexport:src/application/project.ts->src/ports/projects-folder.ts`.
Its value is the number of names re-exported (1 for `export *`). The finding's `details` gives both files' unit and
part, the names and the edges.

## Options

None. A pass-through that is meant is a structure the config can say: importers that need the other unit use it
directly, the unit wraps it in its own type, or the other unit moves inside the one that presents it.

## When not to use it

When an archetype exists to present its siblings as one API and the structure can't change yet. Turn the rule off on
that archetype or part, `rules: { 'no-cross-unit-reexport': false }`, so it stays on everywhere else.
