#!/usr/bin/env python3
"""Hand one message to hook-notices instead of printing it under a tool call.

Call it from any Claude Code hook command, passing the hook's own JSON input
on stdin:

    notify.py "3 lint warnings in src/"             # level info
    notify.py --level alert "deploy check failed"   # shown first, marked ⚠

Exit status:
    0  written; the hook should print nothing else for this message
    2  hook-notices is not on for this session (HOOK_NOTICES_SINK is not 1):
       show the message your usual way, e.g. as a systemMessage
    1  could not write (bad session id, unwritable directory)

The file format is all hook-notices reads, so any language can write it: one
JSON object per line in $HOOK_NOTICES_DIR/<session_id>.jsonl (default
~/.claude/data/hook-notices), with "ts" (ISO 8601), "event" (the hook event),
"text", and optionally "level": "alert".
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# The session id becomes a file name: nothing that could leave the directory.
SESSION_ID = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9._-]*$")


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    parser.add_argument("text")
    parser.add_argument("--level", choices=["info", "alert"], default="info")
    args = parser.parse_args()

    if os.environ.get("HOOK_NOTICES_SINK") != "1":
        return 2

    try:
        hook = json.load(sys.stdin)
    except ValueError:
        hook = {}
    if not isinstance(hook, dict):
        hook = {}
    session = str(hook.get("session_id") or os.environ.get("CLAUDE_CODE_SESSION_ID") or "")
    if not SESSION_ID.match(session) or ".." in session:
        print(f"notify.py: unusable session id {session!r}", file=sys.stderr)
        return 1

    folder = Path(os.environ.get("HOOK_NOTICES_DIR") or Path.home() / ".claude" / "data" / "hook-notices")
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "event": str(hook.get("hook_event_name") or "unknown"),
        "level": args.level,
        "text": args.text,
    }
    line = (json.dumps(entry, ensure_ascii=False) + "\n").encode("utf-8")
    try:
        folder.mkdir(parents=True, exist_ok=True)
        # One write() in append mode, so hooks running at the same moment do
        # not land inside each other's lines (a buffered file may split it).
        fd = os.open(folder / f"{session}.jsonl", os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
        try:
            written = os.write(fd, line)
            # A short write leaves half a line, which parseNotices skips; finish it.
            while written < len(line):
                written += os.write(fd, line[written:])
        finally:
            os.close(fd)
    except OSError as exc:
        print(f"notify.py: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
