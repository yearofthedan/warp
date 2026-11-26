Rule: a ruleset's rule ids and each rule's options are checked against the rules the config runs, and every problem is listed.

```yaml warp.yaml
root:
  modules:
    src: { files: '**' }

rulesets:
  default:
    extends: [warp:recommended]
    rules: { module-cycle: { types: always } }
    on: { root.src: { no-such-rule: off } }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:8: rulesets.default.rules.module-cycle.types: expected 'count' or 'ignore'
warp.yaml:9: rulesets.default.on.root.src: no rule called no-such-rule
```

```text exit
2
```
