Rule: a repeated key is named, and an unquoted * is told to be quoted, each at its line.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }
    src: { dir: lib }
    all: { dir: * }

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
warp config: warp.yaml:4: Map keys must be unique (src)
warp.yaml:5: a value that starts with * is quoted, '*'
```

```text exit
2
```
