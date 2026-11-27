Rule: a class over the tripwire whose stateful methods fall into groups that share no fields or calls is reported, naming each group; accessors and stateless methods are left out.

```yaml warp.yaml
root:
  ruleset:
    extends: [warp:recommended]
    rules:
      class-cohesion: { maxLines: 4 }
  modules:
    src: { dir: src }
```

```ts src/server.ts
export class Server {
  #handlers = new Map<string, string>();
  #transportId = 0;

  get size() {
    return this.#handlers.size;
  }

  addHandler(pattern: string) {
    this.#handlers.set(pattern, pattern);
  }
  getHandler(pattern: string) {
    return this.#handlers.get(pattern);
  }

  setTransportId(id: number) {
    this.#transportId = id;
  }
  send(packet: string) {
    return `${this.#transportId}:${packet}`;
  }

  status(code: number) {
    return code;
  }
}
```

```sh
warp check
```

```text stdout
src/server.ts:1 [class-cohesion] Class Server in src/server.ts:1 is 26 lines, 12 of them in methods that use its state (tripwire 4), and its methods fall into 2 groups that share no fields or calls: [addHandler, getHandler] (lines 9-14); [setTransportId, send] (lines 16-21). Each group can become its own class.

By rule and module:
  class-cohesion  src  1

1 finding
```
