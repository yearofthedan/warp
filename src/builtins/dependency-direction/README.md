# dependency-direction

**Audience:** anyone reading a `dependency-direction` finding, or setting the rule.
**Purpose:** what `dependency-direction` reports, why, and its options.

Disallow imports outside the importer's reach.

## Why

Layers only protect anything if dependencies point one way. Once the domain imports an adapter, changing the
database means changing the domain, tests need the database, and the layers stop being separable. The direction is
cheap to keep and expensive to recover, so it is checked on every import.

## Rule details

`using` is the only permission. A file may import the rest of its own module, what its module's `using` names, and, in a
files module, what its folder module's `using` names. Anything else is a finding, one per
pair of files. Its value is the number of names imported, so importing more across the same boundary counts as
worse. Type-only imports count too.

An import is judged on the file its specifier names, not the file that declares the names, so a barrel a module exposes
lets importers through. The barrel's own re-exports are judged as its imports.

With this config:

```ts
import { archetype, dir, files, using } from '@yearofthedan/warp';

const card = archetype('card')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ strings: dir() })
  .contains((m, { required, self }) =>
    m
      .module('subcomponent', dir('{name}'), self)
      .module('logic', files('*.ts'))
      .module('dom', files('{name}.dom.ts'), using((m) => [m.logic, m.subcomponent.render, required.strings])),
  )
  .exposes((m) => ({ render: m.dom }));
```

Incorrect code:

```ts fragment
// src/ui/project/project.dom.ts
import { cardLooks } from './card/card.ts'; // private: card exposes only render
import { renderBadge } from './card/badge/badge.dom.ts'; // private: card doesn't pass badge's render on
import { title } from '../../model/shell.ts'; // above: a module reaches up only through what it requires
```

```ts fragment
// src/ui/project/project.ts
import { renderCard } from './card/card.dom.ts'; // not in using: logic doesn't use the subcomponents
```

Correct code:

```ts fragment
// src/ui/project/project.dom.ts
import { project } from './project.ts';
import { renderCard } from './card/card.dom.ts';
import { strings } from '../strings/en.ts'; // required.strings, provided by ui
```

The message says why: the module that keeps the target private and what it exposes instead, that the target is above
the importer, or what the importer's reach does hold. Package imports are judged by
[`module-externals`](../module-externals/README.md).

## Options

None. The config's `using` sets what it allows.

## When not to use it

For code with no direction to keep, such as scripts. Give its module a `using` that lists what it may reach, or turn
the rule off for that module.

See also [`no-cross-module-reexport`](../no-cross-module-reexport/README.md), which reports the file that re-exports
another module's file, where this rule reports each importer.
