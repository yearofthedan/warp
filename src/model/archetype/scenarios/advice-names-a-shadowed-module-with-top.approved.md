Rule: when a nearer module shares a name, the advice names the outer one with top.

```yaml warp.yaml
root:
  modules:
    core: { dir: src/core, exposes: all }
    feat:
      dir: src/feat
      modules:
        core: { dir: core, exposes: all }
        leaf: { files: leaf.ts, dependencies: [core] }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/core/a.ts
export const a = 1;
```

```ts src/feat/core/b.ts
export const b = 1;
```

```ts src/feat/leaf.ts
import { a } from '../core/a.ts';
import { b } from './core/b.ts';

export const leaf = a + b;
```

```sh
warp check
```

```text stdout
src/feat/leaf.ts:1 [dependency-direction] src/feat/leaf.ts (leaf of root.feat src/feat) imports src/core/a.ts (root.core src/core), which is outside leaf's reach. Add top.core to root.feat.leaf.dependencies (warp.yaml:8), or move the code. (+1 more in reach)

By rule and module:
  dependency-direction  src/feat:leaf  1

1 finding
```
