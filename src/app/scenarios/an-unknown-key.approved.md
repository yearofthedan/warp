Rule: a key the language does not have is refused at its line.

```yaml warp.yaml
root:
  modules:
    src: { dir: src, export: all }

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
warp config: warp.yaml:3: root.src: unknown key export; a module takes description, dir, files, entry, archetype, dependencies, exposes, modules, test
```

```text exit
2
```
