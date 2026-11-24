# CLI

**Audience:** anyone running warp from a shell, a hook or CI.
**Purpose:** warp's commands, flags, reporters and exit codes.

```sh
warp check                 # every finding in the working tree: CI and the project's check script
warp diff HEAD             # new or worse findings in the working tree since HEAD: an agent's edit hook
warp diff main..feature    # new or worse findings between two refs
warp diff main...          # new or worse findings since the working tree's branch left main
warp model                 # the modules the config finds, and the module each file is in
warp --help                # the usage, with every flag
```

[diff.md](diff.md) explains how `diff` compares the two sides.

## Flags

| Flag | Effect |
| --- | --- |
| `--config <file>` | Config path. The project root is its directory. Default: the first of `warp.config.ts`, `.mts`, `.js` and `.mjs` in the current directory. |
| `--ruleset <name>` | Check with one of the config's [rulesets](config.md#rulesets). Default: the one named `default`, if any. |
| `--reporter <name>` | Output format, default `text`. |
| `--fail` | Exit 1 when there are findings (`check`) or new or worse ones (`diff`). |
| `--since-last-run` | With `diff` and no head, compare the working tree with its findings at the last run with this flag. See [diff.md](diff.md#since-the-last-run). |
| `--rules` | With `model`, list the rule settings each module changes. |
| `--json` | With `model`, print the model as JSON, with every module's resolved rule settings. |

## Reporters

| Reporter | Output |
| --- | --- |
| `text` | One line per finding, then for `check` the findings counted by rule and module, and a total. For `diff`, findings are marked `new` or `worse (was N)`. |
| `json` | `{ findings }` for `check`; `{ added, worsened, resolved }` for `diff`. Each finding has the fields in [rules.md](rules.md#findings). |
| `sarif` | SARIF 2.1.0 for GitHub code scanning: the findings to act on, with paths from the repository root. |
| `claude-hook` | A Claude Code PostToolUse hook response, or nothing when there is nothing to act on. |
| `omp` | An omp `tool_result` handler result, or nothing when there is nothing to act on. |

The findings to act on are every finding for `check`, and the new and worse ones for `diff`.

A finding quotes file names and code from the repository, so `text`, `claude-hook` and `omp` print a control
character as its JSON escape, such as `\n`, and a finding always takes one line. `claude-hook` and `omp` show an agent
the first 20 findings, each cut at 500 characters, and then say how many more there are.

## Exit codes

| Code | When |
| --- | --- |
| `0` | The run finished: no findings to act on, or findings without `--fail`. |
| `1` | `--fail` was given and there are findings to act on. |
| `2` | warp could not run: a config error, an unknown ruleset or reporter, or a bad command line. |
