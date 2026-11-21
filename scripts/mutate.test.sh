#!/bin/sh

root=$(cd "$(dirname "$0")/.." && pwd)
. "$root/scripts/_test-helpers"

make_copy
run_copy mutate
expect_status 0 "mutate succeeds when stryker does"
expect_vp 'stryker run .*/stryker.config.mjs' "mutate runs stryker with the project's config"

rm "$copy/node_modules/.bin/stryker"
status=0
PATH=/usr/bin:/bin "$copy/do" mutate >"$work/out" 2>"$work/err" || status=$?
expect_status 1 "mutate fails without stryker"
expect_err 'Run pnpm install' "mutate says how to get stryker"

finish
