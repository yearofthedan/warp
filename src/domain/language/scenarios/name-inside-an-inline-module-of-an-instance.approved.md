Rule: {name} inside an inline module of an archetype is the instance's folder name.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
  modules:
    feats: { dir: 'src/*', archetype: feat }

archetypes:
  feat:
    modules:
      sub:
        dir: sub
        modules:
          entry: { files: '{name}.ts' }
          rest: { files: '*.ts' }
```

```ts src/cart/sub/cart.ts
export const cart = 1;
```

```ts src/cart/sub/other.ts
export const other = 1;
```

```sh
warp model
```

```text stdout
(root)  root: root
  src/cart  feats: feat {name=cart}
    src/cart/sub  sub: feat.sub {name=cart}
      src/cart/sub:entry  1 file
      src/cart/sub:rest  1 file

5 modules, 2 files, 0 loose.
```
