Rule: model prints the modules the config finds and the files in each.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    domain: { dir: src/domain, exposes: all }
    ui: { dir: src/ui, dependencies: [domain] }
```

```ts src/domain/order.ts
export const order = 1;
```

```ts src/ui/view.ts
import { order } from '../domain/order.ts';
export const view = order;
```

```ts src/stray.ts
export const stray = 1;
```

```sh
warp model
```

```text stdout
(root)  root: root
  loose: src/stray.ts
  src/domain  domain: root.domain, 1 file
  src/ui  ui: root.ui, 1 file

3 modules, 3 files, 1 loose.
```
