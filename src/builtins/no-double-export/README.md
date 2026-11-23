# no-double-export

**Audience:** anyone reading a `no-double-export` finding, or setting the rule.
**Purpose:** what `no-double-export` reports, why, and its options.

Report each re-export, in a file on its module's surface, of another file on the same surface.

## Why

A module's surface is the way into it. A barrel that re-exports a file the module also exposes gives importers two ways to
the same names, so some import the barrel and some the file, and the surface no longer says which is meant. Either a
barrel is the surface, over private files, or the files are, with no barrel.

## Rule details

A file is on its module's surface when the module exposes it, itself or through a child's surface it passes on. Each of
its re-exports, `export ... from` or an imported name exported again, is judged on the file its specifier names: if
the module exposes that file too, it is a finding. A re-export of a private file passes, since the barrel is then the
only way to it.

The rule reports one finding per pair of files, keyed `no-double-export:src/domain/index.ts->src/domain/order.ts`, on
the first re-export. Its value is the number of names re-exported.

With this config, `index.ts` may not re-export `order.ts`, because `domain` exposes both:

```ts
import { archetype, defineConfig, dir, exposes, files, using } from '@yearofthedan/warp';

const app = archetype('app').contains((m) =>
  m
    .module('domain', dir('src/domain'), exposes(files('index.ts', 'order.ts')))
    .module('ui', dir('src/ui'), using((m) => [m.domain])),
);

export default defineConfig({ root: app });
```

Incorrect code:

```ts fragment
// src/domain/index.ts
export { order } from './order.ts';
```

```
src/domain/index.ts:1 [no-double-export] src/domain/index.ts (app.domain src/domain) re-exports src/domain/order.ts (app.domain src/domain), and src/domain exposes both, so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.
```

Correct config: `domain` exposes `files('index.ts')`, so the barrel is the only way in.

Fix it by exposing only the barrel, or only the files and deleting the barrel's re-export.

## Options

None.
