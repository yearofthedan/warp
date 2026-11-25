# unused-declaration

**Audience:** anyone reading an `unused-declaration` finding, or setting the rule.
**Purpose:** what `unused-declaration` reports, why, and how to fix it.

Report a dependency, a surface or a module that the code doesn't use.

## Why

A declaration nothing uses still reads as a fact about the design. A stale dependency lets a module reach something it
never needs, so a new import there passes without anyone deciding it. A surface nobody imports is an API with no
callers. A module that matches no files describes code that has moved or never existed. Each is one line of config to
fix, and the config stays a true picture of the code.

## Rule details

The rule judges the model as a whole and reports one finding per declaration, on the config file, line 1. Its
`details.kind` says which of three things it found:

- `grant`: a `dependencies` or `test.provides` entry, a test module's included, that no file it covers imports
  through. An archetype module's `dependencies` are judged across all its instances: one that imports through it is
  enough.
- `surface`: an `exposes`, `entry` or named surface, a test module's included, that no file outside the module
  imports. The root module's surface, and the `entry` of a module directly below it, are what the project offers
  its own users, so they always count as used.
- `empty`: a module whose `dir` or `files` matches no files. Its own `dependencies` and surface are covered by this
  one finding.

`details` gives the kind, where it is declared, the layer (`production` or `test`), the declaration as written, and
the modules judged.

## Example

With this config:

```yaml
root:
  modules:
    domain: { dir: src/domain, exposes: all }
    ports: { dir: src/ports, exposes: all, dependencies: [domain, npm:zod] }
    styles: { files: 'src/*.css', exposes: all }

rulesets:
  default:
    extends: [warp:recommended]
```

and these files:

```text
src/domain/order.ts
src/ports/store.ts     imports ../domain/order.ts
```

the rule reports:

```text
warp.yaml:1 [unused-declaration] root.ports.dependencies names npm:zod, but nothing in src/ports imports through it. Remove it.
warp.yaml:1 [unused-declaration] root.ports exposes: all, but nothing outside src/ports imports it. Remove it, or use the module where it is needed.
warp.yaml:1 [unused-declaration] root.styles matches no files: files: 'src/*.css' finds nothing in the root. Fix the pattern, or remove the module.
```

keyed `unused-declaration:grant:root.ports.dependencies->npm:zod`, `unused-declaration:surface:root.ports:exposes: all`
and `unused-declaration:empty:root.styles`. Each has value 1.

## How to fix

Remove the declaration from the config, or fix the pattern of a module that matches nothing.

## Options

None.

## When not to use it

When a config is being written ahead of the code it describes. Turn the rule off for that archetype or module in a
ruleset, `on: { root.ports: { unused-declaration: off } }`, so it stays on everywhere else.
