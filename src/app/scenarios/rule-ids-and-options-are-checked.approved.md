Rule: a ruleset's rule ids and each rule's options are checked against the rules the config runs, and every problem is listed.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
    rules: { module-cycle: { types: always } }
  modules:
    src: { files: '**', ruleset: { rules: { no-such-rule: off } } }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:4: root.ruleset.rules.module-cycle.types: expected 'count' or 'ignore'
warp.yaml:6: root.src.ruleset.rules: no rule called no-such-rule
```

```text exit
2
```
