Rule: a tsconfig the config names but the project lacks is refused at its line.

```yaml warp.yaml
tsconfig: [tsconfig.app.json]

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
warp check
```

```text stderr
warp config: warp.yaml:1: tsconfig: no tsconfig.app.json beside warp.yaml; add it, or list the project's tsconfig files under tsconfig
```

```text exit
2
```
