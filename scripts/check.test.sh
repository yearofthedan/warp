#!/bin/sh

root=$(cd "$(dirname "$0")/.." && pwd)
. "$root/scripts/_test-helpers"

make_copy
run_copy check
expect_status 0 "check succeeds when every step does"
expect_vp_literal 'secretlint **/*' "check scans the project for secrets"
expect_vp 'check' "check runs vp check from node_modules"
expect_vp 'tsc -p .*/tsconfig.json' "check type-checks with the pinned tsc"
if [ "$(grep -c '^pnpm audit --json$' "$VP_LOG")" = 2 ]; then ok "check audits the head and the base"; else no "check audits the head and the base"; fi
expect_vp 'test' "check runs the tests"
if [ "$(tail -n 1 "$VP_LOG")" = 'node src/cli.ts check --fail' ]; then ok "check ends with warp checking itself"; else no "check ends with warp checking itself"; fi

printf '#!/bin/sh\necho "vp $*" >> "$VP_LOG"\n[ "$1" = check ] && exit 1\nexit 0\n' >"$copy/node_modules/.bin/vp"
run_copy check
expect_status 1 "check fails when vp check does"
if grep -q '^node src/cli.ts' "$VP_LOG"; then no "check stops at the first failure"; else ok "check stops at the first failure"; fi

finish
