# Architecture decision records

**Audience:** anyone who needs to know why warp is the way it is, before changing it.
**Purpose:** records why each decision was chosen over its alternatives, one record per decision.

A decision gets a record when it is costly to reverse or likely to be questioned again. A record is numbered, dated and
has a status, then four sections: Context, Options considered, Decision and Consequences. Once Accepted, it stays as
written, and a later decision supersedes it with a new record.

| # | Decision | Status |
| --- | --- | --- |
| [1](0001-toolchain.md) | Vite+ for checks and tests, plain tsc for the build | Accepted |
| [2](0002-config-is-architectural.md) | The config is architectural | Accepted |
| [3](0003-yaml-config.md) | The config is a YAML file | Accepted |
