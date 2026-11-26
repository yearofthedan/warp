Rule: {name} outside an archetype is refused at the pattern's line, since nothing captures it.

```yaml warp.yaml
root:
  modules:
    main: { files: 'src/{name}.ts' }

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
warp config: warp.yaml:3: root.main.files: 'src/{name}.ts' names {name}, which (root) doesn't capture
```

```text exit
2
```
