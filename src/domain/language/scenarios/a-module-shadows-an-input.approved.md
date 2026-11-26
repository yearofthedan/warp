Rule: a module named like one of its archetype's inputs shadows it, and is refused.

```yaml warp.yaml
root:
  modules:
    log: { dir: src/log, exposes: all }
    cards: { dir: 'src/cards/*', archetype: card, dependencies: [log] }

archetypes:
  card:
    requires: [log]
    modules:
      log: { files: log.ts, exposes: all }
      logic: { files: '*.ts', dependencies: [log] }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/log/log.ts
export const log = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:10: card.log shadows the input log; rename one
```

```text exit
2
```
