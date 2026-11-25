# 3. The config is a YAML file

Status: Accepted, 2026-11-25

## Context

What format should a warp config be written in?

Today a config is TypeScript that calls warp's builders (`archetype().contains(...).using((m) => [...])`) and
compiles to `ConfigData`. In use, three things decide the format:

- **Read at a glance.** The config is the model of the codebase that people and agents read
  ([ADR 2](0002-config-is-architectural.md)). Builder chains wrap over many lines once formatted, and handles such as
  `m`, `required` and `self` are names a reader has to learn before reading the config.
- **Edited by tools.** Finding advice already names the config change that fixes it. A tool that applies that change
  needs to read and write the config as data.
- **Loaded safely.** Loading a TypeScript config runs the user's code.

A spike ran working title's config, written in YAML, through a loader built on the builders. It loaded and its
findings matched those predicted, plus mistakes in the YAML itself.

Type checking was the builders' main gain, and most of what it catches, the loader checks again.

## Options considered

| Option | Read at a glance | Edited by tools | Loaded safely |
| --- | --- | --- | --- |
| TypeScript builders (today) | Chains and handles to learn | Needs a TS program to rewrite | Runs user code |
| TypeScript object literal | Plain nesting, still TS syntax | Needs a TS program to rewrite | Runs user code |
| JSONC | Plain nesting; quotes and braces everywhere | Parsed by `typescript`, writes lose comments | Data only |
| YAML 1.2 | Plain nesting, least syntax | `yaml` keeps comments and order when it writes | Data only |
| A custom language | Shaped to warp | warp owns a parser and a formatter | Data only |

## Decision

A warp config is a `warp.yaml` file, in YAML 1.2, read with the [`yaml`](https://www.npmjs.com/package/yaml) package
(ISC, no dependencies). It is warp's second runtime dependency. The builders are deleted, `ConfigData` stays the
loaded form, and custom rules stay TypeScript plugins, loaded by path. The config holds no code.

The language:

```yaml
root:
  modules:
    app:
      dir: src
      modules:
        domain: { dir: domain, exposes: all }
        ports:
          dir: ports
          dependencies: [domain]
          exposes: all
          test: { modules: { tests: { files: '*.test.ts', dependencies: [npm:vite-plus] } } }

archetypes:
  component:
    marker: '{name}.dom.ts'
    requires: [strings, application]
    exposes: [render]
    modules:
      logic: { files: '*.ts', dependencies: [strings, application] }
      render: { files: '{name}.dom.ts', dependencies: [logic, strings] }

rulesets:
  default:
    extends: [warp:recommended]
    test: { function-cohesion: off }
```

- `dependencies` is what a module's own code may import. Where a module uses an archetype, its `dependencies` fill
  the archetype's `requires`.
- A bare name is a sibling or an input, and a dotted name is a path down the tree. `top.` starts at the top of the
  archetype or root it is written in. `npm:x`, `node:*` and `virtual:x` are packages.
- `exposes` is `all`, a list of the module's own children, or `{ files: [...] }`.
- Each module has one `test:` block. `test.provides` reaches every test module inside it, and `test.exposes` is
  the surface test code elsewhere may import.
- YAML 1.2 only: `on` and `off` are strings. Anchors and merge keys fail to load.

[docs/config.md](../config.md) becomes the reference for this language.

## Consequences

- A config has no type checking at edit time. A JSON Schema gives an editor the shape, and references between
  modules are checked at load.
- warp has a second runtime dependency, so `yaml`'s releases and advisories are warp's to track.
- The model changes to match the language. A child of an inline module, test module or not, names its holder's
  siblings in `dependencies`. A module that uses an archetype passes it its inputs there, and an archetype states no
  shape (`dir()` or `files()`) for them. A files module holds test modules, and modules are declared in any order.
- Finding advice and load errors speak YAML, and point at a line in `warp.yaml`.
- A config computes nothing. Repetition stays written out, or becomes an archetype.
