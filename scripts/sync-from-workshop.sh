#!/bin/zsh -f
# Copy the four published mods from the workshop monorepo into this repo.
#
#   scripts/sync-from-workshop.sh [workshop-plugins-dir]
#
# Everything lands in a staging directory first. The marketplace file is
# generated there, then three checks run: a secret scan, a scan for private
# names and paths, and each mod's own tests. Only when all three pass does
# the staging copy replace plugins/ and .claude-plugin/ here; on any failure
# this repo is left as it was.
set -u

ROOT=${0:A:h:h}
SRC=${1:-$HOME/workshop/plugins}
MODS=(quiet-tools turn-nav hook-notices prompt-band)
# Names that must never ship: whoever runs this, by account name (which also
# covers their home path) and git mail. Read at run time so this file names no one.
mail=$(git -C "$SRC" config user.email 2>/dev/null)
PRIVATE="${USER}${mail:+|$mail}"
[[ -n $USER ]] || { print -u2 "sync: USER is empty, cannot scan for private names"; exit 1; }

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
fail() { print -u2 "sync: $*"; exit 1; }

for m in $MODS; do
  [[ -f $SRC/$m/.claude-plugin/plugin.json ]] || fail "no plugin at $SRC/$m"
  rsync -a --delete --exclude '.claude-plugin/types/' --exclude node_modules \
    "$SRC/$m/" "$STAGE/plugins/$m/" || fail "copy of $m failed"
done

mkdir -p "$STAGE/.claude-plugin"
/usr/bin/python3 - "$STAGE" $MODS <<'EOF' || fail "marketplace generation failed"
import json, sys
stage, mods = sys.argv[1], sys.argv[2:]
plugins = []
for m in mods:
    meta = json.load(open(f"{stage}/plugins/{m}/.claude-plugin/plugin.json"))
    plugins.append({
        "name": meta["name"],
        "description": meta["description"],
        "version": meta["version"],
        "author": meta["author"],
        "source": f"./plugins/{m}",
    })
json.dump({
    "name": "claude-code-mods",
    "owner": {"name": "OperonLab"},
    "metadata": {"description": "Mods that make a long Claude Code session easier to read.", "version": "0.1.0"},
    "plugins": plugins,
}, open(f"{stage}/.claude-plugin/marketplace.json", "w"), indent=2, ensure_ascii=False)
open(f"{stage}/.claude-plugin/marketplace.json", "a").write("\n")
EOF

gitleaks dir "$STAGE" --no-banner --redact > "$STAGE.gitleaks" 2>&1 \
  || { cat "$STAGE.gitleaks" >&2; rm -f "$STAGE.gitleaks"; fail "gitleaks found something"; }
rm -f "$STAGE.gitleaks"

if grep -rnEi "$PRIVATE" "$STAGE" >&2; then fail "private names or paths above"; fi

for m in $MODS; do
  claude plugin validate "$STAGE/plugins/$m" > /dev/null 2>&1 || fail "$m: claude plugin validate failed"
  out=$(claude plugin test "$STAGE/plugins/$m" 2>&1) || { print -u2 -- "$out"; fail "$m: tests failed"; }
  print "  $m: ${${(f)out}[-1]}"
done
"$ROOT/scripts/check-notify-example.sh" "$STAGE/plugins/hook-notices" || fail "hook-notices example check failed"

rsync -a --delete "$STAGE/plugins/" "$ROOT/plugins/"
rsync -a "$STAGE/.claude-plugin/" "$ROOT/.claude-plugin/"
print "synced ${#MODS} mods from $SRC"
git -C "$ROOT" status --short
