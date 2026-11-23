# Agents and CI

**Audience:** anyone wiring warp into a coding agent or a CI pipeline.
**Purpose:** the setups for Claude Code, omp and GitHub code scanning.

An agent sees the findings its edit made new or worse while it still has the code in context, and CI reports the same
delta on the pull request. Both run [`warp diff`](diff.md), with the [reporter](cli.md#reporters) for the tool that
reads it.

## Claude Code

To have Claude Code see what each edit made new or worse, [since the last run](diff.md#since-the-last-run), without
being blocked, add a `PostToolUse` hook to the project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          { "type": "command", "command": "cd \"$CLAUDE_PROJECT_DIR\" && pnpm exec warp diff HEAD --since-last-run --reporter claude-hook", "timeout": 60 }
        ]
      }
    ]
  },
  "permissions": {
    "ask": ["Edit(warp.config.*)"]
  }
}
```

The hook runs as you, outside Claude's permissions and sandbox, and warp runs its config as code. The `ask` rule has
Claude ask before it edits the config, so an edit can't run code through the hook without you seeing it.
[SECURITY.md](../SECURITY.md#running-warp-from-an-agent-hook) has the example and further hardening.

To check edits with a lighter set of rules, give the config an `edit` [ruleset](config.md#rulesets) and add
`--ruleset edit` to the command. A non-empty delta prints a `hookSpecificOutput.additionalContext` response, which
Claude reads as context for its next step. When warp itself fails, as with a broken config, the response tells
Claude that warp is unavailable and why. It says so once, until the failure changes or a run succeeds. A repeat
exits 1, which Claude Code shows to you without blocking the edit.

To confirm it works, run the hook's command with a clean tree: it prints nothing. Add an import that no `using`
allows and run it again: it prints a `hookSpecificOutput` naming the import.

## omp

omp runs code after each edit through an extension. Save this as `.omp/extensions/warp.ts` in the project, and start a
new omp session to load it:

```ts fragment
const edits = ['edit', 'write', 'ast_edit', 'apply_patch'];

export default function warp(pi) {
  pi.on('tool_call', async (event, context) => {
    if (!edits.includes(event.toolName) || !JSON.stringify(event.input).includes('warp.config.')) return undefined;
    const allowed = context.hasUI && (await context.ui.confirm('Edit the warp config?', 'warp runs it as code after the edit.'));
    return allowed ? undefined : { block: true, reason: 'Editing the warp config needs the user to allow it.' };
  });
  pi.on('tool_result', async (event, context) => {
    if (event.isError || !edits.includes(event.toolName)) return undefined;
    const args = ['exec', 'warp', 'diff', 'HEAD', '--since-last-run', '--reporter', 'omp'];
    const run = await pi.exec('pnpm', args, { cwd: context.cwd, timeout: 60_000 });
    if (run.code !== 0) return { additionalContext: `warp is unavailable, so edits are not checked: ${run.stderr.trim()}` };
    return run.stdout.trim() === '' ? undefined : JSON.parse(run.stdout);
  });
}
```

After each edit, the `tool_result` handler runs warp and passes its `additionalContext` to the model with the next
request, without blocking the edit. omp runs `pi.exec` as you, with no approval, so the `tool_call` handler asks you
before any edit that names a `warp.config.*` file, and blocks it when omp has no UI to ask in. Add `--ruleset edit` to
`args` to check edits with a lighter ruleset. The shapes follow `@oh-my-pi/pi-coding-agent` 19.1.

## GitHub code scanning

```yaml
# .github/workflows/warp.yml
name: warp
on: pull_request
permissions:
  contents: read
  security-events: write
jobs:
  warp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec warp diff "origin/$BASE..." --reporter sarif > warp.sarif
        env:
          BASE: ${{ github.base_ref }}
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: warp.sarif
```

Code scanning shows each new or worse finding on the pull request's diff. Each result's `partialFingerprints` holds
the finding's key, so code scanning tracks a finding across commits the same way `diff` does. To block a merge on
findings, add a code scanning rule to the branch's ruleset in the repository settings, or replace the upload with
`pnpm exec warp diff "origin/$BASE..." --fail`. The branch name reaches the shell through `env`, so the shell never
reads it as code.
