Rule: a file in a module with modules, which none of them claims, is loose there too, while the module's entry is its own.

```yaml warp.yaml
root:
  ruleset: [warp:recommended]
  modules:
    ui: { dir: src/ui, archetype: ui }

archetypes:
  ui:
    entry: index.ts
    modules:
      views: { files: '*.view.ts', exposes: all }
```

```json tsconfig.json
{
  "compilerOptions": { "target": "es2022", "module": "nodenext", "strict": true, "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src"]
}
```

```ts src/ui/index.ts
export { cart } from './cart.view.ts';
```

```ts src/ui/cart.view.ts
export const cart = 1;
```

```ts src/ui/helpers.ts
export const helper = 1;
```

```sh
warp check
```

```text stdout
src/ui/helpers.ts:1 [unclassified] src/ui/helpers.ts is in no module of src/ui (ui), so nothing says what it may import. Add a files module to ui that matches it, or move it into a module's folder.

By rule and module:
  unclassified  src/ui  1

1 finding
```
