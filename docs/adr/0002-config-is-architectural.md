# 2. The config is architectural

Status: Accepted, 2026-11-21

## Context

What does a warp config describe, and how much should it let a project bend the rules?

- **Model for agents.** The config is the model of the codebase that agents and codemods read, so it has to say what
  the parts are and how they may depend on each other, not only which imports fail.
- **Smells travel.** A config that needs exceptions, long allow lists or path tricks usually describes a structure that
  is itself tangled.
- **Explicit over clever.** A rule a reader cannot see in the config is one an agent will break.

## Options considered

| Option | Model for agents | Smells travel | Explicit over clever |
| --- | --- | --- | --- |
| Architectural config: named parts, what each exposes, what each may use | The config is the map | An awkward config points at awkward code | Every permission is written down |
| Lint-style config: path globs and import bans | A list of prohibitions | Exceptions pile up in the config instead | Permissions are whatever is not banned |

## Decision

The config language is architectural and explicit: parts and archetypes, what each exposes, what each uses, as
[docs/config.md](../config.md) sets out. A smell in the config is treated as a smell in the
project's structure, and the fix is usually in the code, not in another escape hatch.

## Consequences

Features that would let a config paper over structure, such as broad ignores or per-import exceptions, need a strong
case. warp's own config is the first test of this: it declares its own test tiers.
