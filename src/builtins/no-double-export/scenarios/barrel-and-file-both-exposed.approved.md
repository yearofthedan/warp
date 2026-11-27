Rule: a module that exposes both a barrel and a file it re-exports is reported.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    domain: { dir: src/domain, exposes: { files: [index.ts, order.ts] } }
    ui: { dir: src/ui, dependencies: [domain] }
```

```ts src/domain/order.ts
export const order = (id: string) => ({ id });
```

```ts src/domain/index.ts
export { order } from './order.ts';
```

```ts src/ui/view.ts
import { order } from '../domain/index.ts';
import { order as again } from '../domain/order.ts';
export const view = () => [order('a'), again('b')];
```

```sh
warp check
```

```text stdout
src/domain/index.ts:1 [no-double-export] src/domain/index.ts (root.domain src/domain) re-exports src/domain/order.ts (root.domain src/domain), and src/domain exposes both, so importers have two ways to the same names. Keep one: stop re-exporting it, or stop exposing it.

By rule and module:
  no-double-export  src/domain  1

1 finding
```
