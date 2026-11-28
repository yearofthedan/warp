Rule: a dependency that names no module in scope is refused, listing what is, at its line.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:boundaries, warp:cohesion, warp:coupling]
  modules:
    domain: { dir: src/domain }
    ui: { dir: src/ui, dependencies: [domian] }
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
warp config: warp.yaml:6: root.ui.dependencies: 'domian': no module or input called domian here; in scope: domain. A package is npm:domian
```

```text exit
2
```
