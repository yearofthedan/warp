Rule: a name a module's entry exports is reported when no other module imports it.

```yaml warp.yaml
root:
  ruleset: [warp:boundaries]
  modules:
    app:
      dir: src
      modules:
        billing: { dir: billing, entry: index.ts }
        ui: { dir: ui, dependencies: [billing] }
```

```ts src/billing/refund.ts
export const refund = (id: string) => `refund ${id}`;
export const reissue = (id: string) => `reissue ${id}`;
```

```ts src/billing/index.ts
export { refund, reissue } from './refund.ts';
```

```ts src/billing/audit.ts
import { reissue } from './refund.ts';
export const audit = (id: string) => reissue(id);
```

```ts src/ui/page.ts
import { refund } from '../billing/index.ts';
export const page = (id: string) => refund(id);
```

```sh
warp check
```

```text stdout
src/billing/index.ts:1 [unused-export] src/billing/index.ts exports reissue on src/billing's surface, but nothing outside src/billing imports it. Stop exporting it from src/billing/index.ts, or keep the file off the surface.

By rule and module:
  unused-export  src/billing  1

1 finding
```
