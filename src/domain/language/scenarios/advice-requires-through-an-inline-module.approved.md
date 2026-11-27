Rule: an archetype used inside an inline module is told to require what sits above that module.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    domain: { dir: src/domain, exposes: all }
    area:
      dir: src/area
      modules:
        comps: { dir: '*', archetype: comp }

archetypes:
  comp:
    modules:
      logic: { files: '*.ts' }
```

```ts src/domain/order.ts
export const order = 1;
```

```ts src/area/a/a.ts
import { order } from '../../domain/order.ts';

export const a = order;
```

```sh
warp check
```

```text stdout
src/area/a/a.ts:1 [dependency-direction] src/area/a/a.ts (logic of comp src/area/a) imports src/domain/order.ts (root.domain src/domain), which is outside logic's reach. Add domain to comp.requires (warp.yaml:12), bound in the dependencies of root.area.comps and add domain to comp.logic.dependencies (warp.yaml:14), or move the code.

By rule and module:
  dependency-direction  src/area/a:logic  1

1 finding
```
