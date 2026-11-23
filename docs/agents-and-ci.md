# Agents and CI

**Audience:** anyone wiring warp into a coding agent or a CI pipeline.
**Purpose:** how `diff` measures a change, and the setups for Claude Code and GitHub code scanning.

An agent sees the findings its edit made new or worse while it still has the code in context, and CI gates the
same delta on the pull request. Both run `warp diff`, with the reporter for the tool that reads it. For omp, see
[integrations/omp/README.md](../integrations/omp/README.md).

## Diff

`diff <base>[..<head>]` checks both sides with the working tree's config, so a delta reflects code changes, never
rule changes. With three dots, `<base>...<head>`, the base is where `<head>` (or the working tree's `HEAD`) left
`<base>`, as in git. A base commit where the project's tsconfig does not exist yet counts as having no findings.

A ref is checked out into a temporary git worktree that links the project's `node_modules`, and its
findings are cached under `.git/warp-cache/` by commit, config (with the custom rules it imports) and a digest of
warp's own code and TypeScript version, so repeated runs against the same base only analyse the head, and a linked
checkout that edits a built-in rule redoes the base. Each new entry prunes those from other builds of warp and those
unread for 30 days. Without a head, the head is the working tree.

## Facts cache

Every command reuses the facts it read from each file on its last run, from `.git/warp-cache/`, so a run after an
edit analyses only the edited files and the files that import them, directly or through others. A file's facts are
reused while its content, the content of everything it imports, warp's own code and TypeScript version, the
compiler options the tsconfig files resolve to, and the size and modification time of every file the program reads
from outside the project or from `node_modules` are unchanged. Adding or removing a file also redoes each file with an import specifier
that names it, and changing a `.d.ts` file in the project redoes every file. Outside a git repository nothing is
cached. Checkouts for `diff` share the cache, so a base close to the working tree analyses only what differs.

A finding is new when neither its key nor any of its parts is in a finding at the base, and worse when its value rose
above that finding's. A loop that gains a module shares parts with the smaller loop at the base, so it is worse, not
new, and a loop that loses one is neither. A new or worse finding with several sites is shown at the first one on a
line the change added, so a loop is reported at the import that closed it. Findings in a renamed file or function
count as new. Function findings are keyed by name, and a callback is named after its call and a string first
argument, such as `<callback to it("saves an order")>`, so a key survives edits elsewhere in the file. Functions that
still share a name get `#2`, `#3` in order of appearance.

`diff HEAD` measures uncommitted changes, so a commit resets the baseline. To measure the whole branch instead, diff
against where it left main, `main...`.

## Since the last run

`diff <base> --since-last-run` compares the working tree with its findings at the previous run with the flag, so a
hook that runs it after every edit reports each new or worse finding once, after the edit that made it. The findings
are kept under `.git/warp-cache/` for each working tree, config and ruleset. The first run, and the first after
`HEAD` moves (a commit, a pull or a branch switch), compares with `<base>` instead. A change made between two runs by
anyone is reported at the second run, so an agent may see a finding its own edit did not cause.

## Claude Code

To have Claude Code see what each edit made new or worse, [since the last run](#since-the-last-run), without being
blocked, add a `PostToolUse` hook to the project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          { "type": "command", "command": "cd \"$CLAUDE_PROJECT_DIR\" && warp diff HEAD --since-last-run --ruleset edit --reporter claude-hook", "timeout": 60 }
        ]
      }
    ]
  }
}
```

Leave out `--ruleset edit` to check with the default config, or keep it with an `edit` [ruleset](config.md#rulesets)
in the config. Where `warp` is a dev dependency, use `pnpm exec warp` in the command. A non-empty delta prints a
`hookSpecificOutput.additionalContext` response, which Claude reads as context for its next step. When warp itself
fails, as with a broken config, the response tells Claude warp is unavailable and why, once until the failure changes
or a run succeeds. A repeat of the same failure exits 1 rather than 2, which Claude Code would treat as blocking
feedback, so you see it and Claude does not.

## GitHub code scanning

```yaml
permissions:
  security-events: write
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - run: warp diff origin/${{ github.base_ref }}... --reporter sarif > warp.sarif
  - uses: github/codeql-action/upload-sarif@v3
    with:
      sarif_file: warp.sarif
```

Each result's `partialFingerprints` holds the finding's key, so code scanning tracks a finding across commits the
same way `diff` does.
