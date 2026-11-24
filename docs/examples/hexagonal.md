# Hexagonal layout

**Audience:** anyone writing a config for a codebase laid out as ports and adapters.
**Purpose:** a worked config for that layout, and the findings it gives when a use case reaches an adapter.

```text
src/
├── domain/order.ts                 the model, importing nothing
├── application/
│   ├── placeOrder.ts               a use case and the Orders port it needs, importing the domain
│   └── placeOrder.test.ts          tests the use case with a fake Orders
├── adapters/
│   ├── memoryOrders.ts             implements Orders in memory
│   └── pgOrders.ts                 implements Orders with pg
└── main.ts                         wires an adapter into the use case
```

```ts
// warp.config.ts
import { all, archetype, defineConfig, dir, exposes, files, pkg, ruleset, using } from '@yearofthedan/warp';

const app = archetype('app')
  .contains((c) =>
    c
      .module('domain', dir('src/domain'), exposes(all()))
      .module('application', dir('src/application'), exposes(all()).using((m) => [m.domain]))
      .module('adapters', dir('src/adapters'), exposes(all()).using((m) => [m.domain, m.application, pkg('*')]))
      .module('main', files('src/main.ts'), using((m) => [m.application, m.adapters]))
      .testModule('tests', files('src/**/*.test.ts')),
  )
  .testUsing([pkg('vitest')]);

const base = ruleset().on(app.modules.tests, { 'function-cohesion': false });

export default defineConfig({ root: app, tests: files('src/**/*.test.ts'), rulesets: { default: base } });
```

`domain` uses nothing, so it imports only its own files. `application` reaches the domain alone, so a use case names
ports, and adapters implement them. `main` uses only `application` and `adapters`, so it reaches the domain through
the use cases.

The project passes `warp check` with no findings. Then a use case imports an adapter:

```ts fragment
// src/application/placeOrder.ts
import { memoryOrders } from '../adapters/memoryOrders.ts';
```

```text
src/application/placeOrder.ts:2 [dependency-direction] src/application/placeOrder.ts (app.application src/application) imports src/adapters/memoryOrders.ts (app.adapters src/adapters), which is outside application's reach: app.application uses m.domain. Add what holds src/adapters/memoryOrders.ts to a using if the dependency is intended, or move the code.
src/adapters/memoryOrders.ts:2 [no-cycle] src/adapters/memoryOrders.ts and src/application/placeOrder.ts import each other in a loop: src/adapters/memoryOrders.ts:2 imports src/application/placeOrder.ts, src/application/placeOrder.ts:2 imports src/adapters/memoryOrders.ts. Break it at one of these imports: move what both need into a file they both import, or invert one import.
src/adapters/memoryOrders.ts:2 [module-cycle] src/adapters and src/application import each other in a loop: src/adapters -> src/application (src/adapters/memoryOrders.ts:2 imports src/application/placeOrder.ts, and 1 other import), src/application -> src/adapters (src/application/placeOrder.ts:2 imports src/adapters/memoryOrders.ts). Break it at one of these imports: move what both sides need into a module they both use, or turn module-cycle off on the module that holds them if they are meant to use each other.

By rule and module:
  dependency-direction  src/application  1
  module-cycle          src/adapters     1
  no-cycle              src/adapters     1

3 findings
```

The adapter already imports the use case's port, so the one import breaks the direction and closes a loop between
files and between modules. The fix is in the code: `main.ts` passes the adapter in, and the use case keeps to its
port.
