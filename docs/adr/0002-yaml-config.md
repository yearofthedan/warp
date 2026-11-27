# 2. The config is a YAML file

Status: Accepted, 2026-11-25

## Context

What format should a warp config be written in?

Today a config is TypeScript that calls warp's builders (`archetype().contains(...).using((m) => [...])`) and
compiles to `ConfigData`. In use, three things decide the format:

- **Read at a glance.** The config is the model of the codebase that people and agents read. Builder chains wrap over many lines once formatted, and handles such as
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

[docs/config.md](../config.md) is the reference for the language.

## Consequences

- A config has no type checking at edit time. A JSON Schema gives an editor the shape, and references between
  modules are checked at load.
- warp has a second runtime dependency, so `yaml`'s releases and advisories are warp's to track.
- Loading a config costs about 35ms, importing `yaml` and parsing it, against about 60ms for a TypeScript config.
  Analysis takes most of a run, which is 400ms or more.
