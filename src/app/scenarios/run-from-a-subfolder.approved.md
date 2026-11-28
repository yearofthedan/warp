Rule: run from a subfolder, warp takes the nearest warp.yaml above it and checks the whole project, with paths from the project root.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
  modules:
    ui: { dir: src/ui }
    domain: { dir: src/domain, exposes: all }
```

```ts src/domain/order.ts
export const order = 1;
```

```ts src/ui/a.ts
import { order } from '../domain/order.ts';

export const a = order;
```

```sh
cd src/ui && warp check
```

```text stdout
src/ui/a.ts:1 [dependency-direction] src/ui/a.ts (root.ui src/ui) imports src/domain/order.ts (root.domain src/domain), which is outside ui's reach. Add domain to root.ui.dependencies (warp.yaml:5), or move the code.

By rule and module:
  dependency-direction  src/ui  1

1 finding
```
