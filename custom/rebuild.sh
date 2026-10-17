#!/usr/bin/env bash
# Rebuild a patched T3 Code nightly: rebase custom/stack onto the installed
# nightly's release tag, rebuild the server bundle, and graft it into a copy of
# the installed app. See custom/README.md.
set -euo pipefail

INSTALL=${INSTALL:-/usr/lib/t3code-nightly}
OUT=${OUT:-$HOME/apps/t3code-nightly-patched}
LAUNCHER=${LAUNCHER:-$HOME/.local/bin/t3code-nightly-custom}
# Paths the server-bundle graft can ship. Changes elsewhere (web, desktop, mobile,
# shared contracts) need a full desktop build instead.
GRAFTABLE='^(custom/|apps/server/|packages/(provider-[^/]+|effect-acp|effect-codex-app-server)/)'

die() { echo "error: $*" >&2; exit 1; }
tool() { mise x node@24 pnpm@11.10.0 -- "$@"; }

cd "$(git rev-parse --show-toplevel)"
[[ $(git branch --show-current) == custom/stack ]] || die "run from the custom/stack worktree"
[[ -z $(git status --porcelain) ]] || die "working tree not clean"

ver=$(ELECTRON_RUN_AS_NODE=1 "$INSTALL/t3code" "$INSTALL/resources/app.asar/apps/server/dist/bin.mjs" --version | sed 's/^t3 v//')
tag=v$ver
echo "installed: $ver"

git fetch -q origin "refs/tags/$tag:refs/tags/$tag" || die "tag $tag not found upstream"
old=$(git describe --tags --abbrev=0 --match 'v*-nightly.*' HEAD)
if [[ $old != "$tag" ]]; then
  echo "rebasing custom/stack: $old -> $tag"
  git rebase --onto "$tag" "$old" custom/stack ||
    die "rebase conflict. Resolve it (drop a commit if upstream now has the fix), 'git rebase --continue', rerun."
fi

bad=$(git diff --name-only "$tag"..HEAD | grep -Ev "$GRAFTABLE" || true)
[[ -z $bad ]] || die "stack changes files the server graft cannot ship:"$'\n'"$bad"

shipped=$(mktemp -d)
trap 'rm -rf "$shipped"; git checkout -q -- . 2>/dev/null || true' EXIT
tool npx --yes asar extract "$INSTALL/resources/app.asar" "$shipped"

# The release pipeline bakes these into the server bundle; read them back from
# the shipped bundle so the rebuilt one is identical apart from our commits.
eval "$(node - "$shipped/apps/server/dist" <<'JS'
const fs = require("fs");
const dir = process.argv[2];
const src = fs.readdirSync(dir).filter((f) => /^binCli-.*\.mjs$/.test(f))
  .map((f) => fs.readFileSync(`${dir}/${f}`, "utf8")).find((s) => s.includes("buildTimeRelayUrl"));
if (!src) throw new Error("shipped bundle has no build-time config chunk");
const env = {
  T3CODE_RELAY_URL: /buildTimeRelayUrl = normalizeSecureRelayUrl\("([^"]*)"\)/,
  T3CODE_CLERK_PUBLISHABLE_KEY: /buildTimeClerkPublishableKey = readBuildTimeValue\("([^"]*)"\)/,
  T3CODE_CLERK_CLI_OAUTH_CLIENT_ID: /buildTimeClerkCliOAuthClientId = readBuildTimeValue\("([^"]*)"\)/,
  T3CODE_RELAY_CLIENT_OTLP_TRACES_URL: /tracesUrl: readBuildTimeValue\("([^"]*)"\)/,
  T3CODE_RELAY_CLIENT_OTLP_TRACES_DATASET: /tracesDataset: readBuildTimeValue\("([^"]*)"\)/,
  T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN: /tracesToken: readBuildTimeValue\("([^"]*)"\)/,
};
for (const [name, re] of Object.entries(env)) {
  const m = src.match(re);
  if (!m) throw new Error(`cannot read ${name} from shipped bundle`);
  console.log(`export ${name}='${m[1]}'`);
}
JS
)"

tool pnpm install --frozen-lockfile
tool node scripts/update-release-package-versions.ts "$ver"
tool pnpm exec vp run --filter t3 build

rm -f "$shipped"/apps/server/dist/*.mjs
cp apps/server/dist/*.mjs "$shipped/apps/server/dist/"

# Native modules live outside the asar; keep exactly the packages the stock app unpacks.
unpack=()
for d in "$INSTALL"/resources/app.asar.unpacked/node_modules/*/; do
  name=$(basename "$d")
  if [[ $name == @* ]]; then
    for s in "$d"*/; do unpack+=("node_modules/$name/$(basename "$s")"); done
  else
    unpack+=("node_modules/$name")
  fi
done
unpack_glob=$(IFS=,; echo "${unpack[*]}")
[[ ${#unpack[@]} -gt 1 ]] && unpack_glob="{$unpack_glob}"

rm -rf "$OUT.new"
cp -a "$INSTALL" "$OUT.new"
tool npx --yes asar pack "$shipped" "$OUT.new/resources/app.asar" --unpack-dir "$unpack_glob"

got=$(ELECTRON_RUN_AS_NODE=1 "$OUT.new/t3code" "$OUT.new/resources/app.asar/apps/server/dist/bin.mjs" --version | sed 's/^t3 v//')
[[ $got == "$ver" ]] || die "patched server reports $got, expected $ver"

rm -rf "$OUT.prev"
[[ -e $OUT ]] && mv "$OUT" "$OUT.prev"
mv "$OUT.new" "$OUT"

# Same launcher as the stock package (Wayland flags, user flags file), pointed at the patched copy.
mkdir -p "$(dirname "$LAUNCHER")"
sed "s#/usr/lib/t3code-nightly/t3code#$OUT/t3code#" /usr/bin/t3code-nightly >"$LAUNCHER"
chmod +x "$LAUNCHER"

echo "ok: $OUT ($ver + $(git rev-list --count "$tag"..HEAD) custom commits)"
echo "launch: $LAUNCHER   (quit any running T3 Code first)"
