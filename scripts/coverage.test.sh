#!/bin/sh

root=$(cd "$(dirname "$0")/.." && pwd)
. "$root/scripts/_test-helpers"

make_copy
run_copy coverage
expect_status 0 "coverage succeeds when c8 does"
expect_vp_literal "c8 --include src/** --exclude **/*.test.ts --reporter text --reporter text-summary vp test --project e2e" "coverage runs the e2e tier under c8, counting src/ without tests"

finish
