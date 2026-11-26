Rule: a reporter warp does not have is refused, listing the ones it has.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check --reporter xml
```

```text stderr
no reporter called xml: use one of text, json, claude-hook, omp, sarif
```

```text exit
2
```
