# unclassified

**Audience:** anyone reading an `unclassified` finding, or setting the rule.
**Purpose:** what `unclassified` reports, why, and how to fix it.

Report a [loose file](../../../docs/concepts.md#loose-file), one that no files module of its folder module matches.

## Why

Every other rule is set by module, so a file in no module is checked against nothing. Reporting it makes the config
cover the whole codebase, and makes each new place for code a decision.

## Rule details

The rule judges the root module's loose files unless a ruleset turns it off, and a nested module's where a ruleset
turns it on, for the module's archetype, the module that found it, a module above it, or the whole config. `warp model`
lists every loose file.

## Example

```ts
import { archetype, defineConfig, files } from '@yearofthedan/warp';

const app = archetype('app').contains((c) => c.module('domain', files('src/domain/**')).module('ui', files('src/ui/**')));

export default defineConfig({ root: app });
```

With `src/stray.ts` in the project:

```text
src/stray.ts:1 [unclassified] src/stray.ts is in no module of . (app), so nothing says what it may import. Add a files module to app that matches it, or move it into a module's folder.
```

## How to fix

Add a module that matches the file, or move the file into a module's folder.

## Options

None.

## When not to use it

While a codebase is being described module by module. Turn it off for the archetype still in progress, so new folders
elsewhere are still reported.
