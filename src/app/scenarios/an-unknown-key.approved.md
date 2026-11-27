Rule: a key the language does not have is refused at its line.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
  modules:
    src: { dir: src, export: all }
```

```ts src/a.ts
export const a = 1;
```

```sh
warp check
```

```text stderr
warp config: warp.yaml:5: root.src: unknown key export; a module takes description, dir, files, entry, archetype, dependencies, exposes, modules, test, ruleset
```

```text exit
2
```
