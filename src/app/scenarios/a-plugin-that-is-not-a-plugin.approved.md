Rule: a plugin file whose default export is not a plugin is refused at its line.

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

```ts rules/team.ts
export default 3;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:8: plugins.team: expected a plugin, { rules: Rule[] }, as the default export of its file
```

```text exit
2
```
