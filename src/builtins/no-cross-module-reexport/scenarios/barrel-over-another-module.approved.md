Rule: a re-export of another module's file is reported.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    domain: { dir: src/domain, exposes: all }
    application: { dir: src/application, exposes: all, dependencies: [domain] }
    ui: { dir: src/ui, dependencies: [application] }
```

```ts src/domain/order.ts
export const order = (id: string) => ({ id });
```

```ts src/application/index.ts
export * from '../domain/order.ts';
```

```ts src/ui/view.ts
import { order } from '../application/index.ts';
export const view = () => order('a');
```

```sh
warp check
```

```text stdout
src/application/index.ts:1 [no-cross-module-reexport] src/application/index.ts (root.application src/application) re-exports everything from src/domain/order.ts (root.domain src/domain), so its importers reach src/domain through src/application. src/ui/view.ts may not use src/domain directly, so give src/application its own type that hides it, or move it into src/application if src/application owns it.

By rule and module:
  no-cross-module-reexport  src/application  1

1 finding
```
