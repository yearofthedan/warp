Rule: a warp.yaml that is not YAML is refused with where it breaks.

```yaml warp.yaml
root:
  modules:
    src: { dir: src
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: <project>/warp.yaml:4: Flow map in block collection must be sufficiently indented and end with a }
```

```text exit
2
```
