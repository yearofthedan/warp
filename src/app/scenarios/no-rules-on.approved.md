Rule: a config with no ruleset loads, and check says nothing was checked.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stdout
No findings.
```

```text stderr
No rules are on, so nothing was checked. Turn some on in warp.yaml: root: { ruleset: [warp:boundaries, warp:cohesion, warp:coupling] }
```
