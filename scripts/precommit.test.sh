#!/bin/sh

root=$(cd "$(dirname "$0")/.." && pwd)
. "$root/scripts/_test-helpers"

make_copy
precommit() {
  status=0
  : >"$VP_LOG"
  (cd "$copy" && "$copy/do" precommit) >"$work/out" 2>"$work/err" || status=$?
}
(
  cd "$copy" || exit 1
  echo change >thing.ts
  git add thing.ts
)

precommit
expect_status 0 "precommit succeeds when its steps do"
expect_vp 'secretlint .*' "precommit scans the staged files for secrets"
expect_vp 'staged' "precommit runs vp staged"
if [ "$(head -n 1 "$VP_LOG" | cut -d' ' -f1)" = secretlint ]; then ok "precommit scans before it fixes"; else no "precommit scans before it fixes"; fi

printf '#!/bin/sh\necho "secretlint $*" >> "$VP_LOG"\nexit 1\n' >"$copy/node_modules/.bin/secretlint"
precommit
expect_status 1 "a credential refuses the commit"
expect_no_vp 'staged' "a refused commit is not fixed"

finish
