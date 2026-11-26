Rule: a dependency that names no module in scope is refused, listing what is, at its line.

```yaml warp.yaml
root:
  modules:
    domain: { dir: src/domain }
    ui: { dir: src/ui, dependencies: [domian] }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/domain/order.ts
export const order = 1;
```

```ts src/ui/view.ts
export const view = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:4: root.ui.dependencies: 'domian': no module or input called domian here; in scope: domain
```

```text exit
2
```
