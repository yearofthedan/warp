Rule: an import of a package the module's dependencies do not name is reported.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries]
  modules:
    domain: { dir: src/domain, exposes: all }
    adapters: { dir: src/adapters, dependencies: [domain, npm:pg] }
```

```ts src/domain/order.ts
import { Pool } from 'pg';
export const pool = new Pool();
```

```ts src/adapters/db.ts
import { Pool } from 'pg';
import { pool } from '../domain/order.ts';
export const pools = [pool, new Pool()];
```

```sh
warp check
```

```text stdout
src/domain/order.ts:1 [module-externals] src/domain/order.ts (root.domain src/domain) imports pg, a package outside domain's reach. Add npm:pg to root.domain.dependencies (warp.yaml:5), or move the code.

By rule and module:
  module-externals  src/domain  1

1 finding
```
