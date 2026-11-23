# unclassified

**Audience:** anyone reading a `unclassified` finding, or setting the rule.
**Purpose:** what `unclassified` reports, why, and its options.

Report a loose file, one no part of its module matches.

## Why

Every other rule is set by part, so a file in no part is checked against nothing. New folders would otherwise slip
past the architecture silently. Reporting them makes the config cover the whole codebase, and makes each new place
for code a decision.

## Rule details

The rule judges the root module's loose files unless a ruleset turns it off, and a nested module's only where a ruleset
turns it on, for the module's archetype, the dir part that found it, a module above it, or the whole config. `warp model`
lists every loose file.

With this config, `src/stray.ts` is reported:

```ts
import { archetype } from 'warp';

const app = archetype('app').contains((p) => p.files('domain', 'src/domain/**').files('ui', 'src/ui/**'));
```

Fix it by adding a files part that matches it, or moving it into a part's folder.

## Options

None.

## When not to use it

While a codebase is being described part by part. Turn it off for the archetype still in progress, so new folders
elsewhere are still reported.
