Rule: each loop between sibling modules is reported once, at its first import.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries]
  modules:
    domain: { dir: src/domain, exposes: all, dependencies: [infra] }
    infra: { dir: src/infra, exposes: all, dependencies: [domain] }
```

```ts src/domain/order.ts
import { connect } from '../infra/db.ts';
export const order = () => connect();
```

```ts src/infra/db.ts
import { order } from '../domain/order.ts';
export const connect = () => 1;
export const load = () => order();
```

```sh
warp check
```

```text stdout
src/domain/order.ts:1 [no-cycle] src/domain/order.ts and src/infra/db.ts import each other in a loop: src/domain/order.ts:1 imports src/infra/db.ts, src/infra/db.ts:1 imports src/domain/order.ts. Break it at one of these imports: move what both need into a file they both import, or invert one import.
src/domain/order.ts:1 [module-cycle] src/domain and src/infra import each other in a loop: src/domain -> src/infra (src/domain/order.ts:1 imports src/infra/db.ts), src/infra -> src/domain (src/infra/db.ts:1 imports src/domain/order.ts). Break it at one of these imports: move what both sides need into a module they both use, or turn module-cycle off on the module that holds them if they are meant to use each other.

By rule and module:
  module-cycle  src/domain  1
  no-cycle      src/domain  1

2 findings
```
