Rule: a file two files modules claim equally is refused, naming both patterns.

```yaml warp.yaml
root:
  modules:
    a: { files: 'src/*.ts' }
    b: { files: '**/*.ts' }
```

```ts src/main.ts
export const a = 1;
```

```sh
warp model
```

```text stderr
warp config: src/main.ts: root's files modules a ('src/*.ts') and b ('**/*.ts') are equally specific; narrow one of the patterns
```

```text exit
2
```
