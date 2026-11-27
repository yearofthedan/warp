Rule: a plugin path that names no file is refused at its line.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    src: { dir: src }

plugins:
  team: ./rules/team.ts
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:8: plugins.team: no file at ./rules/team.ts
```

```text exit
2
```
