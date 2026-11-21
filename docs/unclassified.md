# unclassified

Report a module that matches no kind, or in an archetype config, no part where loose files are denied.

## Why

Every other rule is set per kind, so a module without a kind is checked against nothing. New folders would otherwise
slip past the architecture silently. Reporting them makes the config cover the whole codebase, and makes each new
place for code a decision.

## Rule details

This comes from the model rather than a rule, and cannot be turned off. A module is unclassified when no kind's
`match` glob fits it and `exclude` does not remove it.

With this config, `src/stray.ts` is reported:

```json
{
  "kinds": {
    "domain": { "match": "src/domain/**" },
    "app": { "match": "src/app/**" }
  }
}
```

Fix it by adding a glob that covers the file to a kind, moving the file under an existing kind, or adding it to
`exclude` if it should not be checked at all.

In an archetype config, a file is unclassified when it is loose (no files part of its unit matches it) and the
unit's `loose` setting is `deny`, which is the root's default. `warp model` lists every loose file. Fix it by adding a
files part that matches it, moving it into a part's folder, or setting `.loose('allow')` on an archetype whose
stray files don't matter.

## Options

None.
