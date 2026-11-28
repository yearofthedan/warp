Rule: a test that imports another module's test file is told the file is kept for that module's tests.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries]
  modules:
    log: { dir: src/log, exposes: all, test: { modules: { tests: { files: '*.test.ts' } } } }
    ui: { dir: src/ui, test: { modules: { tests: { files: '*.test.ts', dependencies: [log] } } } }
```

```ts src/log/log.ts
export const log = 1;
```

```ts src/log/log.test.ts
import { log } from './log.ts';

export const seed = log;
```

```ts src/ui/ui.ts
export const ui = 1;
```

```ts src/ui/ui.test.ts
import { seed } from '../log/log.test.ts';

export const t = seed;
```

```sh
warp check
```

```text stdout
src/ui/ui.test.ts:1 [dependency-direction] src/ui/ui.test.ts (test module tests of root.ui src/ui) imports src/log/log.test.ts (test module tests of root.log src/log), which src/log keeps for its own tests. Add tests to root.log.test.exposes (warp.yaml:5), or move the code.
warp.yaml:6 [unused-declaration] root.ui.tests.dependencies names log, but nothing in src/ui:tests imports through it. Remove it.
warp.yaml:5 [unused-declaration] root.log exposes: all, but nothing outside src/log imports it. Remove it, or use the module where it is needed.

By rule and module:
  unused-declaration    warp.yaml     2
  dependency-direction  src/ui:tests  1

3 findings
```
