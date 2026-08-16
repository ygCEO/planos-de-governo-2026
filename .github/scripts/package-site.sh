#!/usr/bin/env bash
set -euo pipefail

project="${1:-$PWD}"
archive="${2:?uso: package-site.sh PROJECT_DIR ARCHIVE_PATH}"
build_dir="$project/dist"
hosting="$project/.openai/hosting.json"

test -f "$build_dir/server/index.js" || { echo "dist/server/index.js ausente" >&2; exit 2; }
test -f "$hosting" || { echo ".openai/hosting.json ausente" >&2; exit 2; }

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/dist/.openai"
cp -R "$build_dir"/. "$stage/dist"/
cp "$hosting" "$stage/dist/.openai/hosting.json"
if test -d "$project/drizzle"; then
  mkdir -p "$stage/dist/.openai/drizzle"
  cp -R "$project/drizzle"/. "$stage/dist/.openai/drizzle"/
fi

mkdir -p "$(dirname "$archive")"
node "$(dirname "${BASH_SOURCE[0]}")/deterministic-tar.mjs" "$stage" "$archive" >/dev/null
archive_entries="$(tar -tzf "$archive" | sed 's#^\./##')"
grep -qx 'dist/server/index.js' <<<"$archive_entries"
grep -qx 'dist/.openai/hosting.json' <<<"$archive_entries"
printf '%s\n' "$archive"
