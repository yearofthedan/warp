# warp

warp checks a TypeScript codebase against a declared model of its modules. A `warp.yaml` names the modules and what
each may use, and warp reports the code that steps outside it:

- imports outside a module's reach, including packages it doesn't list.
- imports and re-exports that go around a module's surface.
- import loops between files and between modules.
- files, classes and functions that are too large or too tangled to follow.
- parts of the config that the code no longer uses.

`warp check` judges the whole codebase, for CI. `warp diff` reports only what a change made new or worse, so it can
run after every edit of a coding agent.

## Quick start

warp needs Node 26 or later. Add it to the project as a dev dependency:

```sh
pnpm add -D @yearofthedan/warp
```

Describe the codebase as it is, one module per folder under `src/`, in a `warp.yaml` next to the project's
`tsconfig.json`:

```yaml
root:
  modules:
    utils: { dir: src/utils, exposes: all }
    db: { dir: src/db, exposes: all }
    api: { dir: src/api, dependencies: [db, utils, 'npm:*'], exposes: all }
    main: { files: src/index.ts, dependencies: [api] }
  test:
    provides: [npm:vitest]
    modules:
      tests: { files: 'src/**/*.test.ts' }
    ruleset: [warp:test]
  ruleset: [warp:boundaries, warp:cohesion, warp:coupling]
```

Then check it, and after an edit, see what the edit broke:

```sh
pnpm exec warp check      # every finding in the working tree, for CI
pnpm exec warp diff HEAD  # what changed since the last commit made new or worse, for an edit hook
```

```text
new: src/utils/slug.ts:1 [dependency-direction] src/utils/slug.ts (root.utils src/utils) imports src/db/client.ts (root.db src/db), which is outside utils's reach. Add db to root.utils.dependencies (warp.yaml:3), or move the code.
```

## Read next

- [Getting started](docs/getting-started.md): from this config to a clean `warp check` and a first `diff`, step by
  step.
- [Fixing findings](docs/fixing-findings.md): how to read a finding and decide between changing the code and changing
  the config.
- [Concepts](docs/concepts.md): what each of warp's terms means.
- [Config](docs/config.md) and [CLI](docs/cli.md): the reference for each.
- [Rules](docs/rules.md): every rule warp checks, each with its page.
- [Agents and CI](docs/agents-and-ci.md): running warp after each edit of Claude Code or omp, and on pull requests.
- [Hexagonal layout](docs/examples/hexagonal.md): a stricter config, for ports and adapters.

## Limits

- warp follows `import`, `export … from`, `import x = require()`, `import()`, `require()` and `import('…')` types
  when the specifier is a string literal, a template literal without `${}` included. A specifier computed at runtime,
  such as `import(name)` or `` import(`./${name}.ts`) ``, goes unchecked.
