Rule: an extends that names no ruleset is refused, listing the rulesets there are.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended, strict]
  modules:
    src: { dir: src }

rulesets:
  strickt:
    rules: { no-cycle: on }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:3: root.ruleset.extends: 'strict' is no ruleset; extend warp:recommended, warp:utility, strickt
warp.yaml:8: rulesets.strickt: nothing extends it; a named ruleset applies through a ruleset's extends
```

```text exit
2
```
