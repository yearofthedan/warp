# omp

**Audience:** anyone running warp from omp.
**Purpose:** what the omp extension does, and how to set a project up with it.

[`warp.ts`](./warp.ts) is an omp extension. After each successful `edit`, `write`, `ast_edit` or `apply_patch`, it
runs `warp diff HEAD --since-last-run --reporter omp` in the session's directory and returns the result from its `tool_result`
handler. omp sends a handler's `additionalContext` with the next request to the model, outside the tool result, and
the edit itself is never blocked. When a run fails, as with a broken config or a missing CLI, the context says warp is
unavailable and why, once until the failure changes or a run succeeds. The event and result shapes are from
`@oh-my-pi/pi-coding-agent` 18.22 (`dist/types/extensibility/extensions/types.d.ts`).

## Set up a project

1. **Install the CLI** as [Run it](../../README.md#run-it) describes.

2. **Add a config** in the directory you run omp from, next to the project's `tsconfig.json`, starting from
   [the starter](../../README.md#a-starter-config). The findings `warp check` reports once nothing is `unclassified`
   are the existing baseline. The extension only reports what an edit makes new or worse, so they need no fixing
   first.

3. **Load the extension** in that project:

   ```sh
   mkdir -p .omp/extensions
   ln -s ~/src/warp/integrations/omp/warp.ts .omp/extensions/warp.ts
   ```

   The link points into your clone, so keep it out of git, for example with
   `echo .omp/extensions/warp.ts >> .git/info/exclude`. Linking it into `~/.omp/agent/extensions/` instead loads
   it everywhere; in a project without a config, the first edit of each session says warp is unavailable. Environment
   variables change what it runs, set where you start omp:
   - `WARP_BASE=main...` makes a run with no [last run](../../docs/agents-and-ci.md#since-the-last-run) to
     compare with report against where the branch left main, instead of the last commit.
   - `WARP_RULESET=edit` checks with a [ruleset](../../docs/config.md#rulesets) from the config.
   - `WARP_COMMAND="pnpm exec warp"` runs a project dev dependency instead of the linked command.

4. **Confirm it works.** With a clean tree, `warp diff HEAD --reporter omp` prints nothing. Add an import that
   no `using` allows, such as a domain module importing an adapter, and run it again: it prints
   `{"additionalContext": ...}` naming the import. Revert it, start a new omp session (extensions load at session
   start), and ask omp to make the same edit. Its next reply should take the finding into account.
