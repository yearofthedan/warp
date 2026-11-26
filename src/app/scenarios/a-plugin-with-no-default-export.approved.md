Rule: a plugin file without a default export is refused at its line.

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

```ts rules/team.ts
export const rules = [];
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:6: plugins.team: ./rules/team.ts has no default export; export the plugin as default
```

```text exit
2
```
