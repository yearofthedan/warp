Rule: a name missing inside an archetype points at the archetype's requires.

```yaml warp.yaml
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    cards: { dir: 'src/cards/*', archetype: card }

archetypes:
  card:
    modules:
      logic: { files: '*.ts', dependencies: [domain] }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/domain/order.ts
export const order = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:9: card.logic.dependencies: 'domain': no module or input called domain here; in scope: nothing. A module outside card comes in through card.requires
```

```text exit
2
```
