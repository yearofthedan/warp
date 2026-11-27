Rule: a ruleset written as a list extends the rulesets it names, with no rules of its own, at a module or under `rulesets:`; `ruleset: off` turns every rule off.

```yaml warp.yaml
root:
  ruleset: [lint]
  modules:
    domain: { dir: src/domain, exposes: all }
    adapters: { dir: src/adapters, dependencies: [domain], exposes: all }
    generated: { dir: src/generated, ruleset: off }

rulesets:
  lint: [warp:recommended]
```

```json tsconfig.json
{
  "compilerOptions": { "target": "es2022", "module": "nodenext", "strict": true, "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src"]
}
```

```ts src/adapters/db.ts
import { type Order } from '../domain/order.ts';

export const save = (order: Order) => order.id;
```

```ts src/domain/order.ts
import { save } from '../adapters/db.ts';

export interface Order {
  id: string;
}

export const place = (order: Order) => save(order);
```

```ts src/generated/api.ts
import { save } from '../adapters/db.ts';

export const api = save;
```

```sh
warp check
```

```text stdout
src/domain/order.ts:1 [dependency-direction] src/domain/order.ts (root.domain src/domain) imports src/adapters/db.ts (root.adapters src/adapters), which is outside domain's reach. No declared path allows this: either the import or the structure is wrong.
src/adapters/db.ts:1 [no-cycle] src/adapters/db.ts and src/domain/order.ts import each other in a loop: src/adapters/db.ts:1 imports src/domain/order.ts, src/domain/order.ts:1 imports src/adapters/db.ts. Break it at one of these imports: move what both need into a file they both import, or invert one import.
src/adapters/db.ts:1 [module-cycle] src/adapters and src/domain import each other in a loop: src/adapters -> src/domain (src/adapters/db.ts:1 imports src/domain/order.ts), src/domain -> src/adapters (src/domain/order.ts:1 imports src/adapters/db.ts). Break it at one of these imports: move what both sides need into a module they both use, or turn module-cycle off on the module that holds them if they are meant to use each other.

By rule and module:
  dependency-direction  src/domain    1
  module-cycle          src/adapters  1
  no-cycle              src/adapters  1

3 findings
```
