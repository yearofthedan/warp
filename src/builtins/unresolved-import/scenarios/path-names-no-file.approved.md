Rule: a relative import that resolves to no file is reported.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries]
  modules:
    ui: { dir: src/ui }
```

```ts src/ui/card.ts
export const card = 1;
```

```ts src/ui/view.ts
import { card } from './crad.ts';
export const view = card;
```

```sh
warp check
```

```text stdout
src/ui/view.ts:1 [unresolved-import] ./crad.ts from src/ui/view.ts resolves to no file. Fix the path, or add the file it names.

By rule and module:
  unresolved-import  src/ui  1

1 finding
```
