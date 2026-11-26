Rule: a ruleset that turns rules on or off for a module the config does not have is refused at its line when it runs.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }

rulesets:
  default:
    extends: [warp:recommended]
  stray:
    extends: [default]
    on: { stranger: { no-cycle: off } }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check --ruleset stray
```

```text stderr
warp config: warp.yaml:10: rulesets.stray.on.stranger: no archetype or module called stranger; name an archetype, or archetype.module
```

```text exit
2
```
