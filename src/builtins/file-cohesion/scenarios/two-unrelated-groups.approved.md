Rule: a file over the tripwire whose code falls into groups that share nothing is reported, naming each group.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:cohesion]
    rules:
      file-cohesion: { maxLines: 4 }
  modules:
    src: { dir: src }
```

```ts src/mixed.ts
const rate = 0.2;
export const tax = (n: number) => n * rate;
export const gross = (n: number) => n + tax(n);

export const shout = (s: string) => s.toUpperCase();
export const banner = (s: string) => `** ${shout(s)} **`;
```

```sh
warp check
```

```text stdout
src/mixed.ts:1 [file-cohesion] src/mixed.ts is 6 lines (tripwire 4) and its top-level code falls into 2 groups that share no calls, top-level state or types: [rate, tax, gross] (lines 1-3); [shout, banner] (lines 5-6). Each group can move to its own file.

By rule and module:
  file-cohesion  src  1

1 finding
```
