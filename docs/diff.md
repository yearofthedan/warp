# Diff

**Audience:** anyone reading `warp diff` output, or wiring it into an edit hook.
**Purpose:** how `diff` decides that a finding is new or worse, what it compares with, and what it caches.

`warp diff` reports the findings a change made **new** or **worse**. The findings already there are the
**baseline**, and `diff` leaves them out. Each baseline finding is still a choice between changing the config and
fixing the code, as [fixing-findings.md](fixing-findings.md) describes, and `diff` lets you make those choices one at
a time.

## What it compares

| Command | Base | Head |
| --- | --- | --- |
| `warp diff HEAD` | the last commit | the working tree |
| `warp diff main..feature` | `main` | `feature` |
| `warp diff main...` | where the working tree's branch left `main` | the working tree |
| `warp diff main...feature` | where `feature` left `main` | `feature` |
| `warp diff HEAD --since-last-run` | the working tree at the last run with the flag | the working tree |

Both sides are checked with the working tree's config and ruleset, so a delta comes from code changes alone. A base
where the project's tsconfig doesn't exist yet has no findings.

`diff HEAD` measures uncommitted changes, so each commit starts a new baseline. `diff main...` measures the whole
branch.

## New and worse

Every finding has a **key** that identifies it across commits, and a **value** that measures it:

```text
key    dependency-direction:src/utils/slug.ts->src/db/client.ts
value  1   (the number of names imported)
```

- A finding is **new** when the base has no finding with its key, or with any of its `parts`.
- A finding is **worse** when its value is higher than the base's, shown as `worse (was N)`.
- A loop lists the pairs of modules or files it links as `parts`. A loop that gains a module is worse, and one that
  loses a module is neither new nor worse.
- A finding that can be fixed in more than one place lists the places as `sites`. A new or worse one is shown at the
  first site on a line the change added, so a loop is reported at the import that closed it.

Function findings are keyed by the function's name. A callback is named after its call and a string first argument,
such as `<callback to it("saves an order")>`, and functions that still share a name get `#2`, `#3` in order. A
finding in a renamed file or function is new.

## Since the last run

`warp diff HEAD --since-last-run` compares the working tree with its findings at the previous run with the flag.
A hook that runs it after every edit reports each new or worse finding once, after the edit that made it.

- The first run, and the first after `HEAD` moves (a commit, a pull or a branch switch), compares with the base,
  `HEAD` here.
- A change made between two runs, by anyone, is reported at the second run, so an agent may see a finding its own
  edit did not cause.
- The last run is kept for each working tree, config and ruleset.

## Cache

warp keeps its cache in `.git/warp-cache/`, and caches nothing outside a git repository. Deleting the folder starts
fresh.

- **Facts.** Each command reuses what it read from each file on its last run, so a run after an edit analyses only
  the edited files and the files that import them. A change to a file's imports, to the compiler options, to warp,
  or to a package in `node_modules` redoes the files it affects. A change to a `.d.ts` file in the project redoes
  every file.
- **Findings.** A ref's files are written to a temporary folder that links the project's `node_modules`, with no
  worktree, git hooks or Git LFS downloads. Its
  findings are cached by commit, config (with the custom rules it imports), ruleset and warp version, so repeated
  runs against the same base analyse only the head. Entries unread for 30 days are pruned.
