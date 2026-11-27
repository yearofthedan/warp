Rule: a dependency, a surface or a module that nothing uses is reported against the config.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    domain: { dir: src/domain, exposes: all }
    ports: { dir: src/ports, exposes: all, dependencies: [domain, npm:zod] }
    styles: { files: 'src/*.css', exposes: all }
```

```ts src/domain/order.ts
export type Order = { id: string };
```

```ts src/ports/store.ts
import type { Order } from '../domain/order.ts';
export type Store = { save(order: Order): void };
```

```sh
warp check
```

```text stdout
warp.yaml:6 [unused-declaration] root.ports.dependencies names npm:zod, but nothing in src/ports imports through it. Remove it.
warp.yaml:6 [unused-declaration] root.ports exposes: all, but nothing outside src/ports imports it. Remove it, or use the module where it is needed.
warp.yaml:7 [unused-declaration] root.styles matches no files: files: 'src/*.css' finds nothing in the root. Fix the pattern, or remove the module.

By rule and module:
  unused-declaration  warp.yaml  3

3 findings
```
