Rule: test code names a files module's test module by its dotted name, and a ruleset can target it.

```yaml warp.yaml
root:
  modules:
    help: { files: 'src/help/*.ts', exposes: all, test: { modules: { t: { files: 'src/help/*.test.ts' } } } }
  test:
    modules:
      e2e: { dir: src/e2e, dependencies: [help.t] }

rulesets:
  default:
    extends: [warp:recommended]
    on: { root.help.t: { unused-declaration: off } }
```

```ts src/help/h.ts
export const h = 1;
```

```ts src/help/h.test.ts
import { h } from './h.ts';

export const seed = h;
```

```ts src/e2e/flow.test.ts
import { seed } from '../help/h.test.ts';

export const flow = seed;
```

```sh
warp check
```

```text stdout
No findings.
```
