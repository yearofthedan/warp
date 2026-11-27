Rule: an input no instance imports through is reported once, on the archetype's requires, not on each binding.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    log: { dir: src/log, exposes: all }
    main: { files: src/main.ts, dependencies: [cards, log] }
    cards: { dir: 'src/cards/*', archetype: card, dependencies: [log] }

archetypes:
  card:
    requires: [log]
    exposes: [logic]
    modules:
      logic: { files: '*.ts', exposes: all, dependencies: [log] }
      sub: { dir: '*', archetype: card, dependencies: [log] }
```

```ts src/log/log.ts
export const log = 1;
```

```ts src/main.ts
import { a } from './cards/a/a.ts';
import { log } from './log/log.ts';

export const main = a + log;
```

```ts src/cards/a/a.ts
export const a = 1;
```

```ts src/cards/a/b/b.ts
export const b = 1;
```

```sh
warp check
```

```text stdout
warp.yaml:11 [unused-declaration] card.requires names log, but nothing in src/cards/a, src/cards/a/b imports through it. Remove it, with its binding at each use.

By rule and module:
  unused-declaration  warp.yaml  1

1 finding
```
