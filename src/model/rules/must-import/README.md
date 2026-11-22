# must-import

**Audience:** anyone reading a `must-import` finding, or setting the rule.
**Purpose:** what `must-import` reports, why, and its options.

Report each file that imports nothing from one of its part's `mustImport`.

## Why

`using` says what a part may import. Some parts exist to sit on top of another: a test DSL drives the UI through the
driver contract, so a DSL that skips the contract talks to a concrete driver and stops running on every driver.
`mustImport` makes that dependency part of the structure, and this rule reports each file that doesn't have it.

## Rule details

A files part lists what each of its files must import, as earlier parts or requirements. Each one must also be in the
part's `using`, since a required import is an allowed one. A file passes for a target when it imports any file the
target reaches, directly or through a barrel on it.

The rule reports one finding per file and target, keyed `must-import:src/ui/card/card.dsl.ts->required.contract`.
Its value is 1. The finding's `details` gives the unit, the part and the target.

With this config, a `*.dsl.ts` file that imports nothing from the contract is reported:

```ts
import { archetype, files } from 'warp';

const component = archetype('component')
  .requires({ contract: files() })
  .contains((p, { required }) =>
    p.files('logic', '*.ts').files('dsl', '*.dsl.ts', {
      using: (s) => [s.logic, required.contract],
      mustImport: [required.contract],
    }),
  );
```

Fix it by importing what the file needs from the target, or by moving the file out of the part.

## Options

None.

## When not to use it

For legacy units that don't follow the structure yet. Turn the rule off for their archetype or dir part in a ruleset,
so it stays on for new code.
