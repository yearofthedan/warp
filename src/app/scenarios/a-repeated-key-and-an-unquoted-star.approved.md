Rule: a repeated key is named, and an unquoted * is told to be quoted, each at its line.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
  modules:
    src: { dir: src }
    src: { dir: lib }
    all: { dir: * }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:6: Map keys must be unique (src)
warp.yaml:7: a value that starts with * is quoted, '*'
```

```text exit
2
```
