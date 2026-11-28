Rule: model --json prints each module with its files, its loose files and its resolved rule settings.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
  modules:
    domain: { dir: src/domain, exposes: all }
    ui: { dir: src/ui, dependencies: [domain] }
```

```ts src/domain/order.ts
export const order = 1;
```

```ts src/ui/view.ts
import { order } from '../domain/order.ts';
export const view = order;
```

```ts src/stray.ts
export const stray = 1;
```

```sh
warp model --json
```

```text stdout
{
  "modules": [
    {
      "id": "(root)",
      "kind": "dir",
      "archetype": "root",
      "captures": {},
      "children": [
        "src/domain",
        "src/ui"
      ],
      "files": [
        "src/stray.ts"
      ],
      "looseFiles": [
        "src/stray.ts"
      ],
      "rules": {
        "unclassified": {},
        "unresolved-import": {},
        "dependency-direction": {},
        "module-externals": {},
        "no-double-export": {},
        "no-cross-module-reexport": {},
        "no-cycle": {
          "types": "count"
        },
        "module-cycle": {
          "types": "count"
        },
        "unused-declaration": {},
        "function-cohesion": {
          "maxLines": 40
        },
        "cognitive-complexity": {
          "max": 15
        },
        "class-cohesion": {
          "maxLines": 100
        },
        "file-cohesion": {
          "maxLines": 200
        },
        "module-size": {
          "max": 1000
        },
        "export-consumers": {
          "max": 3
        },
        "export-spread": {
          "max": 2,
          "ignore": []
        },
        "export-surface": {
          "max": 20
        },
        "module-dependencies": {
          "max": 4,
          "ignore": []
        },
        "package-spread": {
          "max": 2,
          "ignore": []
        }
      }
    },
    {
      "id": "src/domain",
      "name": "domain",
      "kind": "dir",
      "archetype": "root.domain",
      "captures": {},
      "parent": "(root)",
      "children": [],
      "files": [
        "src/domain/order.ts"
      ],
      "looseFiles": [],
      "rules": {
        "unclassified": {},
        "unresolved-import": {},
        "dependency-direction": {},
        "module-externals": {},
        "no-double-export": {},
        "no-cross-module-reexport": {},
        "no-cycle": {
          "types": "count"
        },
        "module-cycle": {
          "types": "count"
        },
        "unused-declaration": {},
        "function-cohesion": {
          "maxLines": 40
        },
        "cognitive-complexity": {
          "max": 15
        },
        "class-cohesion": {
          "maxLines": 100
        },
        "file-cohesion": {
          "maxLines": 200
        },
        "module-size": {
          "max": 1000
        },
        "export-consumers": {
          "max": 3
        },
        "export-spread": {
          "max": 2,
          "ignore": []
        },
        "export-surface": {
          "max": 20
        },
        "module-dependencies": {
          "max": 4,
          "ignore": []
        },
        "package-spread": {
          "max": 2,
          "ignore": []
        }
      }
    },
    {
      "id": "src/ui",
      "name": "ui",
      "kind": "dir",
      "archetype": "root.ui",
      "captures": {},
      "parent": "(root)",
      "children": [],
      "files": [
        "src/ui/view.ts"
      ],
      "looseFiles": [],
      "rules": {
        "unclassified": {},
        "unresolved-import": {},
        "dependency-direction": {},
        "module-externals": {},
        "no-double-export": {},
        "no-cross-module-reexport": {},
        "no-cycle": {
          "types": "count"
        },
        "module-cycle": {
          "types": "count"
        },
        "unused-declaration": {},
        "function-cohesion": {
          "maxLines": 40
        },
        "cognitive-complexity": {
          "max": 15
        },
        "class-cohesion": {
          "maxLines": 100
        },
        "file-cohesion": {
          "maxLines": 200
        },
        "module-size": {
          "max": 1000
        },
        "export-consumers": {
          "max": 3
        },
        "export-spread": {
          "max": 2,
          "ignore": []
        },
        "export-surface": {
          "max": 20
        },
        "module-dependencies": {
          "max": 4,
          "ignore": []
        },
        "package-spread": {
          "max": 2,
          "ignore": []
        }
      }
    }
  ]
}
```
