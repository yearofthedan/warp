Rule: a plugin path that names no file is refused at its line.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }

plugins:
  team: ./rules/team.ts

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
warp config: warp.yaml:6: plugins.team: no file at ./rules/team.ts
```

```text exit
2
```
