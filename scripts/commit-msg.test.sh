#!/bin/sh

root=$(cd "$(dirname "$0")/.." && pwd)
. "$root/scripts/_test-helpers"

repo="$work/repo"
mkdir -p "$repo/.vite-hooks"
cp "$root/do" "$repo/do"
cp -R "$root/scripts" "$repo/scripts"
printf '#!/bin/sh\nexec "%s/do" commit-msg "$1"\n' "$repo" >"$repo/.vite-hooks/commit-msg"
chmod +x "$repo/.vite-hooks/commit-msg"
(
  cd "$repo" || exit 1
  git init -q -b main .
  git config user.email t@example.com
  git config user.name t
  git config core.hooksPath .vite-hooks
  git commit -q --allow-empty -m 'chore: base' --no-verify
)

commit() {
  status=0
  git -C "$repo" commit --allow-empty "$@" >"$work/out" 2>"$work/err" || status=$?
}

for subject in 'feat: add a rule' 'fix(cli): exit 1 on a bad flag' 'refactor!: rename the config' 'build(deps): bump typescript' 'docs: say why'; do
  commit -m "$subject"
  expect_status 0 "\"$subject\" is accepted"
done

for subject in 'Add a rule' 'feat add a rule' 'feat:add a rule' 'feature: add a rule' 'Feat: add a rule' 'feat(CLI): add a flag'; do
  commit -m "$subject"
  expect_status 1 "\"$subject\" is refused"
done
expect_err 'not a conventional commit' "the refusal says why"
expect_err 'feat|fix' "the refusal lists the types"

commit -m 'Merge the lists'
expect_status 0 "a subject starting Merge passes, as GitHub writes them"

commit -m 'fixup! feat: add a rule'
expect_status 0 "a fixup passes, to be squashed"

git -C "$repo" switch -q -c topic
git -C "$repo" commit -q --allow-empty -m 'feat: on topic' --no-verify
git -C "$repo" switch -q main
git -C "$repo" commit -q --allow-empty -m 'feat: on main' --no-verify
status=0
git -C "$repo" merge --no-ff -q -m 'bring in topic' topic >"$work/out" 2>"$work/err" || status=$?
expect_status 0 "a merge passes whatever its message"

finish
