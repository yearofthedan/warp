# no-cross-module-reexport

**Audience:** anyone reading a `no-cross-module-reexport` finding, or setting the rule.
**Purpose:** what `no-cross-module-reexport` reports, why, and its options.

Disallow re-exporting another module's files.

## Why

A file that re-exports another module's names turns its module into a door to that module. Importers then reach the other
module without importing it, so the dependency is hidden from anyone reading their imports. `dependency-direction`
already refuses a re-export the module may not import. This rule reports passing on what the module may use, in the one
file where the leak starts.

## Rule details

A re-export is `export { x } from`, `export * from`, `export * as ns from`, or an imported name exported again with
`export { x }` or `export default x`. Type-only re-exports count. Each is judged on the file its specifier names.

A module owns its own files and the modules nested in it, so a barrel over its own files or its children's surfaces
passes. A re-export of a sibling's, an ancestor's or a provided module's file is a finding.

With this archetype:

```ts
import { archetype, dir, using } from 'warp';

const app = archetype('app').contains((m) =>
  m
    .module('domain', dir('src/domain'))
    .module('ports', dir('src/ports'), using((m) => [m.domain]))
    .module('application', dir('src/application'), using((m) => [m.domain, m.ports])),
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
// src/application/index.ts: a barrel over its own module
export { openProject } from './project.ts';
```

```ts fragment
// src/application/project.ts: uses the port without passing it on
import type { ProjectsFolder } from '../ports/projects-folder.ts';

export const openProject = (folder: ProjectsFolder, name: string) => folder.open(name);
```

There is one finding per pair of files, keyed `no-cross-module-reexport:src/application/project.ts->src/ports/projects-folder.ts`.
Its value is the number of names re-exported (1 for `export *`). The finding's `details` gives both files' modules, the
names and the edges.

## Options

None. A pass-through that is meant is a structure the config can say: importers that need the other module use it
directly, the module wraps it in its own type, or the other module moves inside the one that presents it.

## When not to use it

When an archetype exists to present its siblings as one API and the structure can't change yet. Turn the rule off for
that archetype or module in a ruleset, `.on(facade, { 'no-cross-module-reexport': false })`, so it stays on everywhere
else.
