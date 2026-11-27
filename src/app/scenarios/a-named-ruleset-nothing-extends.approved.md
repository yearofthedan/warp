Rule: a named ruleset applies only through an extends, so one that nothing extends is refused at its line.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    src: { dir: src }

rulesets:
  strict:
    rules: { file-cohesion: { maxLines: 100 } }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:8: rulesets.strict: nothing extends it; a named ruleset applies through a ruleset's extends
```

```text exit
2
```
