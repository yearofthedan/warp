# unclassified

**Audience:** anyone reading a `unclassified` finding, or setting the rule.
**Purpose:** what `unclassified` reports, why, and its options.

Report a loose file, one no files module of its folder module matches.

## Why

Every other rule is set by module, so a file in no module is checked against nothing. New folders would otherwise slip
past the architecture silently. Reporting them makes the config cover the whole codebase, and makes each new place
for code a decision.

## Rule details

The rule judges the root module's loose files unless a ruleset turns it off, and a nested module's only where a ruleset
turns it on, for the module's archetype, the module that found it, a module above it, or the whole config. `warp model`
lists every loose file.

With this config, `src/stray.ts` is reported:

```ts
import { archetype, files } from '@yearofthedan/warp';

const app = archetype('app').contains((m) => m.module('domain', files('src/domain/**')).module('ui', files('src/ui/**')));
```

Fix it by adding a files module that matches it, or moving it into a module's folder.

## Options

None.

## When not to use it

While a codebase is being described module by module. Turn it off for the archetype still in progress, so new folders
elsewhere are still reported.
