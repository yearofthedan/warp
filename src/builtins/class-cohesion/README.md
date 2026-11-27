# class-cohesion

**Audience:** anyone reading a `class-cohesion` finding, or setting the rule.
**Purpose:** what `class-cohesion` reports, why, and how to fix it.

Flag a large class whose methods fall into unrelated groups.

## Why

[`file-cohesion`](../file-cohesion/README.md) sees a class as one member of its file, and
[`function-cohesion`](../function-cohesion/README.md) sees each method alone. A class can still hold two jobs: one set
of methods works on some fields, another set on others, and nothing joins them. Each job then has to be read and
changed around the other. This rule finds that seam and names the groups to split along.

## Rule details

The measure is LCOM4 over the class's methods and fields. Two methods are linked when they use the same field, or one
calls the other through `this` or the class name. A method counts when it reaches a field, directly or through a
method it calls; one that uses no state stays out of every group.

- Static and instance members are judged together, so a static cache beside instance work is a group of its own.
- Fields include `#private` ones, constructor parameter properties, and fields inherited from a base class.
- Getters and setters are not methods here: they link the fields they touch, so a class of fields and accessors
  passes at any size.
- A field's initializer links that field to what it reads.
- The constructor, inherited and abstract methods, and `super` calls link nothing.
- An arrow-function property is a method. A nested `function` is not read, since its `this` is another object.

The size the tripwire compares is the lines of the methods in the groups, so fields, the constructor, accessors,
comments between members and stateless methods don't count towards it. The class is checked once that size is over
`maxLines`.

The finding's value is the number of groups. Its `details` give the class's lines, the judged lines and each group's
method names and line range.

## Example

With `maxLines: 4`, set in a ruleset as `rules: { class-cohesion: { maxLines: 4 } }`.

Incorrect code:

```ts fragment
// src/server.ts
export class Server {
  #handlers = new Map<string, string>();
  #transportId = 0;

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
}
```

```text
src/server.ts:1 [class-cohesion] Class Server in src/server.ts:1 is 18 lines, 12 of them in methods that use its state (tripwire 4), and its methods fall into 2 groups that share no fields or calls: [addHandler, getHandler] (lines 5-10); [setTransportId, send] (lines 12-17). Each group can become its own class.
```

Correct code, one class per group:

```ts fragment
// src/server.ts
export class Handlers {
  #handlers = new Map<string, string>();

  add(pattern: string) {
    this.#handlers.set(pattern, pattern);
  }
  get(pattern: string) {
    return this.#handlers.get(pattern);
  }
}

export class Transport {
  #id = 0;

  setId(id: number) {
    this.#id = id;
  }
  send(packet: string) {
    return `${this.#id}:${packet}`;
  }
}
```

## How to fix

Move each group the message names into a class of its own, or connect the groups if they are one idea.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `maxLines` | `100` | The tripwire. A class is checked once its methods that use state are longer. |

## When not to use it

For a class that is a registry of independent settings by design, with a `getX` and `setX` method per field. Turn the
rule off for that module.
