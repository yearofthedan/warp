Rule: a root that is not a map of modules is refused at its line.

```yaml warp.yaml
root: 3
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:1: root: expected the repository, root: { modules: ... }
```

```text exit
2
```
