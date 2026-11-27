Rule: {name} outside an archetype is refused at the pattern's line, since nothing captures it.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    main: { files: 'src/{name}.ts' }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:5: root.main.files: 'src/{name}.ts' names {name}, which (root) doesn't capture
```

```text exit
2
```
