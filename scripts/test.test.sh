#!/bin/sh

root=$(cd "$(dirname "$0")/.." && pwd)
. "$root/scripts/_test-helpers"

make_copy
run_copy test
expect_status 0 "test succeeds when vp test does"
expect_vp 'test' "test runs vp test"

run_copy test --project unit
expect_vp 'test --project unit' "test passes its arguments on, so one tier runs"

finish
