Rule: test code names a files module's test module by its dotted name, and the test module can carry a ruleset.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    help:
      files: 'src/help/*.ts'
      exposes: all
      test: { modules: { t: { files: 'src/help/*.test.ts', ruleset: { rules: { unused-declaration: off } } } } }
  test:
    modules:
      e2e: { dir: src/e2e, dependencies: [help.t] }
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
