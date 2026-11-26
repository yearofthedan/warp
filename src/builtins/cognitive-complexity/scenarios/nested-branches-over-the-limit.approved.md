Rule: a function over the limit is reported with its largest increments.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }

rulesets:
  default:
    extends: [warp:recommended]
    rules:
      cognitive-complexity: { max: 4 }
```

```ts src/grade.ts
export function grade(score: number, strict: boolean) {
  if (score > 90) {
    for (const n of [1, 2]) {
      if (strict && n > 1) return 'A+';
    }
    return 'A';
  } else if (score > 50 || strict) {
    return 'B';
  } else {
    return 'C';
  }
}
```

```sh
warp check
```

```text stdout
src/grade.ts:1 [cognitive-complexity] Function grade in src/grade.ts:1 has cognitive complexity 10 (limit 4). The largest increments: if at line 4 (+3), for at line 3 (+2), if at line 2 (+1).

By rule and module:
  cognitive-complexity  src  1

1 finding
```
