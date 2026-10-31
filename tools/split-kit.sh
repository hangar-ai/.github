#!/bin/sh
# Makes the repository of one kit, in one command, from Hangar's repository.
#
#   tools/split-kit.sh <kit id> --from <Hangar checkout or URL> [--repo <name>] [--ref <branch>]
#
#   tools/split-kit.sh annotate --from ../IaBench
#   tools/split-kit.sh ci-status --from ../IaBench --repo kit-ci
#
# It copies kits/<id> as committed on the branch, main by default, into a new repository, whose one
# commit cites the commit of Hangar it came from. Your checkout is only read. It makes the repository
# stand alone, checks it, commits, tags v<version> and adds it to ../catalog. Nothing is pushed. When a
# check fails it stops before committing and leaves the folder for you to read.
set -eu

id=""; from=""; repo=""; ref="main"
while [ $# -gt 0 ]; do
  case "$1" in
    --from) from="$2"; shift 2 ;;
    --repo) repo="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    -*) echo "split-kit: unknown option $1" >&2; exit 2 ;;
    *) id="$1"; shift ;;
  esac
done
if [ -z "$id" ] || [ -z "$from" ]; then
  echo "usage: tools/split-kit.sh <kit id> --from <Hangar checkout or URL> [--repo <name>] [--ref <branch>]" >&2
  exit 2
fi
[ -n "$repo" ] || repo="kit-$id"

tools=$(cd "$(dirname "$0")" && pwd)
org=$(cd "$tools/../.." && pwd)
dest="$org/$repo"
if [ -e "$dest" ]; then
  echo "split-kit: $repo already exists: nothing done" >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

source="$from"
if [ ! -d "$from" ]; then
  git clone --quiet --depth 1 --single-branch --branch "$ref" "$from" "$tmp/hangar"
  source="$tmp/hangar"
fi
git -C "$source" cat-file -e "$ref:kits/$id/hangar-kit.json" 2>/dev/null || {
  echo "split-kit: no kits/$id/hangar-kit.json in $from at $ref" >&2
  exit 1
}
commit=$(git -C "$source" rev-parse "$ref^{commit}")

git init --quiet -b main "$dest"
git -C "$dest" config user.name "Hangar.AI"
git -C "$dest" config user.email "hangar-ai@users.noreply.github.com"
git -C "$dest" config commit.gpgsign false
git -C "$dest" config tag.gpgsign false
git -C "$dest" config core.autocrlf false
git -C "$dest" config core.eol lf
git -C "$source" archive "$commit" "kits/$id" | tar -x --strip-components=2 -C "$dest"

node "$tools/standalone-kit.mjs" "$dest" --id "$id" --repo "$repo"

(cd "$dest" && node --test >"$tmp/tests.txt" 2>&1) || {
  grep -E '^(✖|not ok)' "$tmp/tests.txt" | cut -c1-200
  echo "split-kit: the tests of $repo fail: nothing committed, see $dest" >&2
  exit 1
}
grep -E '^(# |ℹ )(tests|pass|fail|skipped) ' "$tmp/tests.txt" || true
node "$tools/../scripts/kit-check.mjs" "$dest" || {
  echo "split-kit: kit-check refuses $repo: nothing committed, see $dest" >&2
  exit 1
}

git -C "$dest" add -A
git -C "$dest" commit --quiet -m "Initial commit: kits/$id of simnJS/hangar-ai at $commit"
version=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$dest/hangar-kit.json")
git -C "$dest" tag -a "v$version" -m "$repo $version"

if [ -f "$org/catalog/scripts/catalog.mjs" ]; then
  node "$org/catalog/scripts/catalog.mjs" add "hangar-ai/$repo" "v$version" --local "$org"
fi
echo "split-kit: $repo is ready at v$version; nothing pushed"
