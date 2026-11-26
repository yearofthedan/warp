Rule: a ruleset name the config does not have is refused, listing the rulesets it has.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }

rulesets:
  default:
    extends: [warp:recommended]
  edit:
    extends: [default]
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check --ruleset pr
```

```text stderr
warp config: no ruleset called pr. Rulesets: default, edit
```

```text exit
2
```
