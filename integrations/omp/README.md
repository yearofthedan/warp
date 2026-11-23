# omp

**Audience:** anyone running warp from omp.
**Purpose:** what the omp extension does, and how to set a project up with it.

[`warp.ts`](./warp.ts) is an omp extension. After each successful `edit`, `write`, `ast_edit` or `apply_patch`, it
runs `warp diff HEAD --since-last-run --reporter omp` in the session's directory and returns the result from its `tool_result`
handler. omp sends a handler's `additionalContext` with the next request to the model, outside the tool result, and
the edit itself is never blocked. When a run fails, as with a broken config or a missing CLI, the context says warp is
unavailable and why, once until the failure changes or a run succeeds.

## Set up a project

1. **Install warp and add a config** in the directory you run omp from, as
   [Getting started](../../docs/getting-started.md) describes.

2. **Leave the baseline.** The extension reports what an edit makes new or worse, so the findings `warp check`
   reports today need no fixing first.

3. **Load the extension** in that project:

   ```sh
   mkdir -p .omp/extensions
   ln -s ../../node_modules/@yearofthedan/warp/integrations/omp/warp.ts .omp/extensions/warp.ts
   ```

   The link points into the dev dependency, so it can be committed and works wherever `pnpm install` has run.
   Environment variables change what it runs, set where you start omp:
   - `WARP_BASE=main...` sets what a run with no [last run](../../docs/diff.md#since-the-last-run) compares with:
     here, where the branch left main. The default is `HEAD`.
   - `WARP_RULESET=edit` checks with a [ruleset](../../docs/config.md#rulesets) from the config.
   - `WARP_COMMAND="pnpm exec warp"` runs the project's dev dependency. Without it, the extension runs `warp` from
     the `PATH`.

4. **Confirm it works.** With a clean tree, `pnpm exec warp diff HEAD --reporter omp` prints nothing. Add an import that
   no `using` allows, such as a domain module importing an adapter, and run it again: it prints
   `{"additionalContext": ...}` naming the import. Revert it, start a new omp session (extensions load at session
   start), and ask omp to make the same edit. Its next reply should take the finding into account.
