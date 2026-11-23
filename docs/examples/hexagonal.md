# Hexagonal layout

**Audience:** anyone writing a config for a codebase laid out as ports and adapters.
**Purpose:** a worked config for that layout, and the findings it gives.

```text
src/
  domain/        order.ts                 the model, importing nothing
  application/   placeOrder.ts            use cases and the ports they need, importing the domain
  adapters/      memoryOrders.ts          ports implemented, importing the application, the domain and packages
  main.ts                                 wires adapters into the application
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
      .module('main', files('src/main.ts'), using((m) => [m.application, m.adapters])),
  )
  .tests(using([pkg('vitest')]));

const base = ruleset().on(app.modules.tests, { 'function-cohesion': false });

export default defineConfig({ root: app, tests: files('src/**/*.test.ts'), rulesets: { default: base } });
```

`domain` uses nothing, so it imports no other module and no package. `application` reaches only the domain, so a use
case never names an adapter. `main` composes the application with adapters and doesn't reach into the domain, so the
use cases stay its only way in.

A use case that imports an adapter is reported where it imports it:

```text
src/application/placeOrder.ts:1 [dependency-direction] src/application/placeOrder.ts (app.application src/application) imports src/adapters/memoryOrders.ts (app.adapters src/adapters), which is outside application's reach: app.application uses m.domain. Add what holds src/adapters/memoryOrders.ts to a using if the dependency is intended, or move the code.
```

Since the adapter already imports the application's port, the same import also closes a loop, reported by
[`module-cycle`](../../src/builtins/module-cycle/README.md) and [`no-cycle`](../../src/builtins/no-cycle/README.md).
