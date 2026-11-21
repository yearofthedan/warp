# dependency-direction

Disallow imports from a kind the importing kind does not depend on, or in an archetype config, imports outside the
importer's reach.

## Why

Layers only protect anything if dependencies point one way. Once the domain imports an adapter, changing the
database means changing the domain, tests need the database, and the layers stop being separable. The direction is
cheap to keep and expensive to recover, so it is checked on every import.

## Rule details

A module may import from its own kind and the kinds its kind's `dependsOn` lists. Named imports are followed through
barrels and re-exports to the module that declares them, so going through an allowed barrel does not hide the
dependency: the finding names the declaring module and the barrel as the route. Type-only imports count too.

With this config:

```json
{
  "kinds": {
    "domain": { "match": "src/domain/**", "dependsOn": [] },
    "adapter": { "match": "src/adapters/**", "dependsOn": ["domain"] }
  }
}
```

Incorrect code:

```ts
// src/domain/order.ts
import { saveOrder } from '../adapters/index.ts'; // reported against src/adapters/db/orderRepo.ts
import type { OrderRow } from '../adapters/db/orderRepo.ts';
```

Correct code:

```ts
// src/domain/order.ts: the domain owns the port
export interface OrderStore {
  save(order: Order): void;
}
```

```ts
// src/adapters/db/orderRepo.ts: the adapter implements it
import type { OrderStore } from '../../domain/order.ts';

export const orderRepo: OrderStore = { save: (order) => { /* ... */ } };
```

There is one finding per pair of modules. Its value is the number of names imported, so importing more across the
same boundary counts as worse. When the target kind may depend on the importer's kind, the message advises a port.
Otherwise it advises moving the code, or adding the kind to `dependsOn` if the dependency is intended.

## In an archetype config

`using` is the only permission. A file may import the rest of its own part, what its part's `using` names, and, for a
unit's own files, what the `using` of the dir part that found the unit names. Anything else is a finding, keyed the
same way, one per pair of files, valued by the names imported.

An import is judged on the file its specifier names, not the file that declares the names, so a barrel a unit exposes
lets importers through. The barrel's own re-exports are judged as its imports.

With this config:

```ts
const card = archetype('card')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ strings: dir() })
  .contains((p, { required, self }) =>
    p
      .dir('subcomponent', '{name}', self)
      .files('logic', '*.ts')
      .files('dom', '{name}.dom.ts', { using: (s) => [s.logic, s.subcomponent.render, required.strings] }),
  )
  .exposes((s) => ({ render: s.dom }));
```

Incorrect code:

```ts
// src/ui/project/project.dom.ts
import { cardLooks } from './card/card.ts'; // private: card exposes only render
import { renderBadge } from './card/badge/badge.dom.ts'; // private: card doesn't pass badge's render on
import { title } from '../../shell.ts'; // above: a unit reaches up only through what it requires
```

```ts
// src/ui/project/project.ts
import { renderCard } from './card/card.dom.ts'; // not in using: logic doesn't use the subcomponents
```

Correct code:

```ts
// src/ui/project/project.dom.ts
import { project } from './project.ts';
import { renderCard } from './card/card.dom.ts';
import { strings } from '../strings/en.ts'; // required.strings, provided by ui
```

The message says why: the unit that keeps the target private and what it exposes instead, that the target is above
the importer, or what the importer's reach does hold. Package imports aren't judged yet, and the rule can't be turned
off on an archetype or part until archetype rule settings land.

## Options

None. The kind's `dependsOn`, or the archetype config's `using`, sets what it allows.

## When not to use it

For a kind with no direction to keep, such as tests or scripts. Give it a `dependsOn` that lists every kind it may
reach, or turn the rule off for that kind.

See also [`no-cross-kind-reexport`](../no-cross-kind-reexport/README.md), which reports the module that re-exports another
kind, where this rule reports each importer.
