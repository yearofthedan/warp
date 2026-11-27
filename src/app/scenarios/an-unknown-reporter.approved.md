Rule: a reporter warp does not have is refused, listing the ones it has.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    src: { dir: src }
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
