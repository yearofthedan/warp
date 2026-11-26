Rule: findings inside archetypes name the module and the archetype, and advice names every requires and dependency to add on the way.

```yaml warp.yaml
tsconfig: [tsconfig.json, tsconfig.test.json]

root:
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

rulesets:
  default:
    extends: [warp:recommended]
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
warp check --fail
```

```text stdout
src/stray.ts:1 [unclassified] src/stray.ts is in no module of the root, so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.
src/ui/card/card.ts:2 [dependency-direction] src/ui/card/card.ts (logic of component src/ui/card) imports src/domain/order.ts (src of layer src/domain), which src/domain keeps private (it exposes api). Import what src/domain exposes instead, once you add domain to component.requires (warp.yaml:23), bound in the dependencies of component.subcomponent and ui.components, add domain to ui.requires (warp.yaml:30), bound in the dependencies of root.ui and add domain to component.logic.dependencies (warp.yaml:27). Or, if src/domain/order.ts should be public, add src to layer.exposes (warp.yaml:13).
src/ui/card/card.ts:1 [module-externals] src/ui/card/card.ts (logic of component src/ui/card) imports node:util, a package outside logic's reach. Add node:util to component.logic.dependencies (warp.yaml:27), or move the code.
src/domain/index.ts:1 [no-cross-module-reexport] src/domain/index.ts (api of layer src/domain) re-exports order, Order from src/domain/order.ts (src of layer src/domain), so its importers reach src/domain:src through src/domain:api. src/main.ts may not use src/domain:src directly, so give src/domain:api its own type that hides it, or move it into src/domain:api if src/domain:api owns it.
warp.yaml:28 [unused-declaration] component.render.dependencies names subcomponent.render, but nothing in src/ui/card:render imports through it. Remove it.
warp.yaml:6 [unused-declaration] root.ui.dependencies names domain, but nothing in src/ui imports through it. Remove it.
warp.yaml:26 [unused-declaration] component.subcomponent matches no files: dir: '*' finds nothing in src/ui/card. Fix the pattern, or remove the module.

By rule and module:
  unused-declaration        warp.yaml          3
  dependency-direction      src/ui/card:logic  1
  module-externals          src/ui/card:logic  1
  no-cross-module-reexport  src/domain:api     1
  unclassified              (root)             1

7 findings
```

```text exit
1
```
