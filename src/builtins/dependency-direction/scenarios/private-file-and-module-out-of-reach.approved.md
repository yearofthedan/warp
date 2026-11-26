Rule: an import of a file its module keeps private, or of a module outside reach, is reported with the fix.

```yaml warp.yaml
root:
  modules:
    domain: { dir: src/domain, exposes: { files: [order.ts] } }
    db: { dir: src/db, exposes: all, dependencies: [domain] }
    api: { dir: src/api, dependencies: [domain] }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/domain/order.ts
export const order = (id: string) => ({ id });
```

```ts src/domain/pricing.ts
export const price = (id: string) => id.length;
```

```ts src/db/orders.ts
import { order } from '../domain/order.ts';
export const save = (id: string) => order(id);
```

```ts src/api/orders.ts
import { price } from '../domain/pricing.ts';
import { save } from '../db/orders.ts';
export const handle = (id: string) => [price(id), save(id)];
```

```sh
warp check
```

```text stdout
src/api/orders.ts:1 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/domain/pricing.ts (root.domain src/domain), which src/domain keeps private (it exposes { files: [order.ts] }). Import what src/domain exposes instead. Or, if src/domain/pricing.ts should be public, add 'pricing.ts' to the files of root.domain.exposes (warp.yaml:3).
src/api/orders.ts:2 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/db/orders.ts (root.db src/db), which is outside api's reach. Add db to root.api.dependencies (warp.yaml:5), or move the code. (+1 more in reach)
warp.yaml:5 [unused-declaration] root.api.dependencies names domain, but nothing in src/api imports through it. Remove it.

By rule and module:
  dependency-direction  src/api    2
  unused-declaration    warp.yaml  1

3 findings
```
