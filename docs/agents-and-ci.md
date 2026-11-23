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
  }
}
```

To check edits with a lighter set of rules, give the config an `edit` [ruleset](config.md#rulesets) and add
`--ruleset edit` to the command. A non-empty delta prints a `hookSpecificOutput.additionalContext` response, which
Claude reads as context for its next step. When warp itself fails, as with a broken config, the response tells
Claude that warp is unavailable and why. It says so once, until the failure changes or a run succeeds. A repeat
exits 1, which Claude Code shows to you without blocking the edit.

To confirm it works, run the hook's command with a clean tree: it prints nothing. Add an import that no `using`
allows and run it again: it prints a `hookSpecificOutput` naming the import.

## omp

omp runs warp through an extension that runs the same `diff` after each edit with `--reporter omp`.
[integrations/omp/README.md](../integrations/omp/README.md) covers loading it into a project.

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
      - run: pnpm exec warp diff origin/${{ github.base_ref }}... --reporter sarif > warp.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: warp.sarif
```

Code scanning shows each new or worse finding on the pull request's diff. Each result's `partialFingerprints` holds
the finding's key, so code scanning tracks a finding across commits the same way `diff` does. To block a merge on
findings, add a code scanning rule to the branch's ruleset in the repository settings, or replace the upload with
`pnpm exec warp diff origin/${{ github.base_ref }}... --fail`.
