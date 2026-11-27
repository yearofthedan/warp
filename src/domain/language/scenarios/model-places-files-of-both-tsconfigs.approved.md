Rule: model prints the modules archetypes find, with the files of every tsconfig the config lists in their modules.

```yaml warp.yaml
tsconfig: [tsconfig.json, tsconfig.test.json]

root:
  ruleset:
    extends: [warp:recommended]
  modules:
    domain: { dir: src/domain, archetype: layer }
    ui: { dir: src/ui, archetype: ui, dependencies: [domain] }
    main: { files: src/main.ts, dependencies: [domain, ui] }
  test:
    provides: ['node:*']

archetypes:
  layer:
    exposes: [api]
    modules:
      src: { files: '**', exposes: all }
      api: { files: index.ts, dependencies: [src], exposes: all }
    test:
      modules:
        tests: { files: '**/*.test.ts' }

  component:
    marker: '{name}.dom.ts'
    requires: [strings]
    exposes: [render]
    modules:
      subcomponent: { dir: '*', archetype: component, dependencies: [strings] }
      logic: { files: '*.ts', exposes: all }
      render: { files: '{name}.dom.ts', dependencies: [logic, subcomponent.render, strings], exposes: all }

  ui:
    exposes: all
    modules:
      strings: { dir: strings, exposes: all }
      components: { dir: '*', archetype: component, dependencies: [strings] }
```

```json tsconfig.json
{
  "compilerOptions": { "target": "es2022", "module": "nodenext", "strict": true, "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

```json tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*.test.ts"],
  "exclude": []
}
```

```ts src/domain/index.ts
export { order, type Order } from './order.ts';
```

```ts src/domain/order.test.ts
import { equal } from 'node:assert/strict';
import { order } from './order.ts';

export const checksTotal = (): void => equal(order(1).total, 1);
```

```ts src/domain/order.ts
export interface Order {
  total: number;
}

export const order = (total: number): Order => ({ total });
```

```ts src/main.ts
import { order } from './domain/index.ts';
import { renderCard } from './ui/card/card.dom.ts';

export const main = (): string => `${renderCard()} of ${order(1).total}`;
```

```ts src/stray.ts
export const stray = true;
```

```ts src/ui/card/card.dom.ts
import { cardTotal } from './card.ts';
import { title } from '../strings/en.ts';

export const renderCard = (): string => `${title}: ${cardTotal()}`;
```

```ts src/ui/card/card.ts
import { format } from 'node:util';
import { order } from '../../domain/order.ts';

export const cardTotal = (): string => format('%d', order(2).total);
```

```ts src/ui/strings/en.ts
export const title = 'Total';
```

```sh
warp model
```

```text stdout
(root)  root: root
  loose: src/stray.ts
  src/domain  domain: layer
    src/domain:src  1 file
    src/domain:api  1 file
    src/domain:tests  1 test file
  src/ui  ui: ui
    src/ui/strings  strings: ui.strings, 1 file
    src/ui/card  components: component {name=card}
      src/ui/card:logic  1 file
      src/ui/card:render  1 file
  (root):main  1 file

11 modules, 7 files, 1 test file, 1 loose.
```
