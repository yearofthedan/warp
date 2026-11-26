Rule: modules written as a list is refused at the modules line.

```yaml warp.yaml
root:
  modules:
    - src: { dir: src }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:2: root.modules: expected a mapping
```

```text exit
2
```
