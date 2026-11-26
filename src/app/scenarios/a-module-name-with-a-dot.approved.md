Rule: a module name with a dot is refused at its own line.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }
    main.ts: { files: main.ts }

rulesets:
  default:
    extends: [warp:recommended]
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:4: root.main.ts: a module's name has no dots, not 'main.ts'
```

```text exit
2
```
