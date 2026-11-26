Rule: with --fail, check exits 1 when there are findings.

```yaml warp.yaml
root:
  modules:
    domain: { dir: src/domain }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/domain/order.ts
export const order = 1;
```

```ts src/stray.ts
export const stray = 1;
```

```sh
warp check --fail
```

```text stdout
src/stray.ts:1 [unclassified] src/stray.ts is in no module of (root) (root), so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.

By rule and module:
  unclassified  (root)  1

1 finding
```

```text exit
1
```
