Rule: modules written as a list is refused at the modules line.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
  modules:
    - src: { dir: src }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:4: root.modules: expected a mapping
```

```text exit
2
```
