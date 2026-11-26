Rule: a plugin path is written ./x, and a package npm:x; a bare one is refused at its line.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }

plugins:
  team: rules/team.ts

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
warp config: warp.yaml:6: plugins.team: 'rules/team.ts' is a path, ./rules/team.ts, or a package, npm:rules/team.ts
```

```text exit
2
```
