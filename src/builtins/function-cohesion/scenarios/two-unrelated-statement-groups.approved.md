Rule: a function over the tripwire whose statements fall into groups that share no locals is reported.

```yaml warp.yaml
root:
  modules:
    src: { dir: src }

rulesets:
  default:
    extends: [warp:recommended]
    rules:
      function-cohesion: { maxLines: 4 }
```

```ts src/handle.ts
export function handle(id: string, log: (line: string) => void) {
  const placed = { id };
  const label = placed.id;
  log(`placed ${label}`);
  const started = Date.now();
  const elapsed = Date.now() - started;
  console.log(elapsed);
}
```

```sh
warp check
```

```text stdout
src/handle.ts:1 [function-cohesion] Function handle in src/handle.ts:1 is 8 lines (tripwire 4) and its statements fall into 2 groups that share no locals: lines 2-4; lines 5-7. Each group can become its own function.

By rule and module:
  function-cohesion  src  1

1 finding
```
