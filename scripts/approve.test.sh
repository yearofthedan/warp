#!/bin/sh

root=$(cd "$(dirname "$0")/.." && pwd)
. "$root/scripts/_test-helpers"

make_copy
run_copy approve
expect_status 2 "approve refuses to run without a scenario file"
expect_err 'usage: ./do approve' "approve says how to name the files"

run_copy approve src/a/scenarios/x.approved.md
expect_status 0 "approve succeeds when vp test does"
expect_vp 'test --project e2e e2e/scenarios.test.ts' "approve plays the scenarios in the e2e tier"

finish
