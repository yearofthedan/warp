# unclassified

**Audience:** anyone reading an `unclassified` finding, or setting the rule.
**Purpose:** what `unclassified` reports, why, and how to fix it.

Report a [loose file](../../../docs/concepts.md#loose-file), one that no files module of its folder module matches.

## Why

Every other rule is set by module, so a file in no module is checked against nothing. Reporting it makes the config
cover the whole codebase, and makes each new place for code a decision.

## Rule details

A file is loose when its folder module has modules and none of them matches it. A folder module without modules owns
all its files, and a module's entry is its own, so neither is loose. `warp model` lists every loose file.

## Example

```yaml
root:
  modules:
    domain: { files: 'src/domain/**' }
    ui: { files: 'src/ui/**' }
  ruleset: [warp:recommended]
```

With `src/stray.ts` in the project:

```text
src/stray.ts:1 [unclassified] src/stray.ts is in no module of the root, so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.
```

## How to fix

Add a module that matches the file, or move the file into a module's folder.

## Options

None.

## When not to use it

While a codebase is being described module by module. Turn it off in the ruleset of the module still in progress, so
new folders elsewhere are still reported.
