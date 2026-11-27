Rule: `import()`, `require()` and `import x = require()` with a literal specifier are judged like a static import; a computed specifier is not followed.

```yaml warp.yaml
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    db: { dir: src/db, exposes: all }
    api: { dir: src/api, dependencies: [domain] }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/domain/order.ts
export const order = (id: string) => ({ id });
```

```ts src/db/orders.ts
export const save = (id: string) => id;
```

```ts src/db/audit.ts
export const audit = (id: string) => id;
```

```ts src/db/schema.ts
export const migrate = (id: string) => id;
```

```ts src/api/orders.ts
import db = require('../db/orders.ts');

declare const require: (id: string) => { audit: (id: string) => string };

export const handle = async (id: string) => {
  const { order } = await import('../domain/order.ts');
  const { migrate } = await import(`../db/schema.ts`);
  const { audit } = require('../db/audit.ts');
  return [order(id), migrate(id), audit(id), db.save(id)];
};

export const plugin = (name: string) => import(`../db/${name}.ts`);
```

```sh
warp check
```

```text stdout
src/api/orders.ts:1 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/db/orders.ts (root.db src/db), which is outside api's reach. Add db to root.api.dependencies (warp.yaml:5), or move the code. (+1 more in reach)
src/api/orders.ts:7 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/db/schema.ts (root.db src/db), which is outside api's reach. Add db to root.api.dependencies (warp.yaml:5), or move the code. (+1 more in reach)
src/api/orders.ts:8 [dependency-direction] src/api/orders.ts (root.api src/api) imports src/db/audit.ts (root.db src/db), which is outside api's reach. Add db to root.api.dependencies (warp.yaml:5), or move the code. (+1 more in reach)

By rule and module:
  dependency-direction  src/api  3

3 findings
```
