#!/bin/zsh -f
# Prove hook-notices' example writer and its reader agree on the file format.
#
#   scripts/check-notify-example.sh [plugins/hook-notices]
#
# Writes through examples/notify.py into a scratch directory, then reads the
# file back with the mod's own parseNotices. Needs python3 and bun.
set -u
ROOT=${0:A:h:h}
P=${1:-$ROOT/plugins/hook-notices}
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
for t in python3 bun; do command -v $t > /dev/null || { print -u2 "check: $t not found, cannot check"; exit 2; }; done

hook='{"session_id":"check-1","hook_event_name":"Stop"}'
print -rn -- "$hook" | HOOK_NOTICES_SINK=1 HOOK_NOTICES_DIR=$D python3 "$P/examples/notify.py" --level alert 'deploy check failed' || exit 1
print -rn -- "$hook" | HOOK_NOTICES_SINK=1 HOOK_NOTICES_DIR=$D python3 "$P/examples/notify.py" 'say "hi" and it'"'"'s fine' || exit 1
print -rn -- "$hook" | env -u HOOK_NOTICES_SINK HOOK_NOTICES_DIR=$D python3 "$P/examples/notify.py" 'sink off'
[[ $? -eq 2 ]] || { print -u2 "check: notify.py did not exit 2 with the sink off"; exit 1; }
print -rn -- '{"session_id":"../x"}' | HOOK_NOTICES_SINK=1 HOOK_NOTICES_DIR=$D python3 "$P/examples/notify.py" 'escape' 2> /dev/null
[[ $? -eq 1 ]] || { print -u2 "check: notify.py accepted a session id that leaves the directory"; exit 1; }

bun -e "
import { parseNotices } from '$P/hooks/notices.ts'
const n = parseNotices(require('fs').readFileSync('$D/check-1.jsonl', 'utf8'))
const ok = n.length === 2 && n[0].level === 'alert' && n[1].text === 'say \"hi\" and it\\'s fine'
if (!ok) { console.error('check: parseNotices read back', JSON.stringify(n)); process.exit(1) }
" || exit 1
print "  hook-notices example: notify.py and parseNotices agree"
