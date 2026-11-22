# unclassified

**Audience:** anyone reading a `unclassified` finding, or setting the rule.
**Purpose:** what `unclassified` reports, why, and its options.

Report a loose file, one no part of its unit matches, where loose files are denied.

## Why

Every other rule is set by part, so a file in no part is checked against nothing. New folders would otherwise slip
past the architecture silently. Reporting them makes the config cover the whole codebase, and makes each new place
for code a decision.

## Rule details

This comes from the model rather than a rule, and cannot be turned off. A file is unclassified when it is loose and
the unit's `loose` setting is `deny`, which is the root's default. `warp model` lists every loose file.

With this config, `src/stray.ts` is reported:

```ts
import { archetype } from 'warp';

const app = archetype('app').contains((p) => p.files('domain', 'src/domain/**').files('ui', 'src/ui/**'));
```

Fix it by adding a files part that matches it, moving it into a part's folder, or setting `.loose('allow')` on an
archetype whose stray files don't matter.

## Options

None.
