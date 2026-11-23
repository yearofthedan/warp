# no-cross-module-reexport

**Audience:** anyone reading a `no-cross-module-reexport` finding, or setting the rule.
**Purpose:** what `no-cross-module-reexport` reports, why, and how to fix it.

Report each re-export of another module's file.

## Why

A file that re-exports another module's names turns its module into a door to that module. Importers then reach the
other module through it, so the dependency is hidden from anyone reading their imports.
[`dependency-direction`](../dependency-direction/README.md) reports a re-export the module may not import. This rule
reports passing on what the module may use, in the one file where the leak starts.

## Rule details

A re-export is `export { x } from`, `export * from`, `export * as ns from`, or an imported name exported again with
`export { x }` or `export default x`. Type-only re-exports count.

A module owns its own files and the modules nested in it, so a barrel over its own files or its children's surfaces
passes. A package's public entry is a barrel of this kind: declare it with `.entry(files('index.ts'))` on the module
that holds what it re-exports. A re-export of a sibling's, an ancestor's or a provided module's file is a finding.

There is one finding per pair of files, keyed
`no-cross-module-reexport:src/application/project.ts->src/ports/projects-folder.ts`. Its value is the number of names
re-exported, 1 for `export *`. Its `details` gives both files' modules, the names and the edges.

## Example

```ts
import { all, archetype, defineConfig, dir, exposes, using } from '@yearofthedan/warp';

const app = archetype('app').contains((c) =>
  c
    .module('domain', dir('src/domain'), exposes(all()))
    .module('ports', dir('src/ports'), exposes(all()).using((m) => [m.domain]))
    .module('application', dir('src/application'), using((m) => [m.domain, m.ports])),
);

export default defineConfig({ root: app });
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

```text
src/application/index.ts:1 [no-cross-module-reexport] src/application/index.ts (app.application src/application) re-exports everything from src/domain/order.ts (app.domain src/domain), so its importers reach src/domain through src/application. Have importers that need it use src/domain directly, give src/application its own type that hides it, or move it into src/application if src/application owns it.
```

Correct code:

```ts fragment
// src/application/index.ts: a barrel over its own module
export { openProject } from './project.ts';
```

```ts fragment
// src/application/project.ts: uses the port and keeps it to itself
import type { ProjectsFolder } from '../ports/projects-folder.ts';

export const openProject = (folder: ProjectsFolder, name: string) => folder.open(name);
```

## How to fix

Have importers that need the other module use it directly, wrap it in a type the re-exporting module owns, or move
the other module inside the one that presents it.

## Options

None.

## When not to use it

When an archetype exists to present its siblings as one API and the structure can't change yet. Turn the rule off for
that archetype or module in a ruleset, `.on(facade, { 'no-cross-module-reexport': false })`, so it stays on everywhere
else.
