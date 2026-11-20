#!/usr/bin/env python3
"""The compact-resume SessionStart hook (matcher `compact`). It finds the `.sikstack/` that owns the session's `cwd`
(the hook's stdin; it follows the session into a worktree), else `$CLAUDE_PROJECT_DIR`, and runs the adapter's
`compact-resume` rooted there, which prints the resume card. Outside any workspace it prints nothing. Never fails:
every error ends in exit 0."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ADAPTER = Path(__file__).resolve().parent.parent / "adapters" / "claude_code" / "adapter.py"
TIMEOUT = 14  # the hook's own timeout is 15 s


def _state_for(start):
    if not start:
        return None
    try:
        here = Path(start).resolve()
    except (OSError, RuntimeError):
        return None
    for d in (here, *here.parents):
        if (d / ".sikstack").is_dir():
            return d / ".sikstack"
    return None


def main() -> int:
    try:
        raw = sys.stdin.read()
    except Exception:  # noqa: BLE001
        raw = ""
    try:
        hook = json.loads(raw or "null")
    except ValueError:
        hook = None
    cwd = hook.get("cwd") if isinstance(hook, dict) else None
    state = _state_for(cwd if isinstance(cwd, str) else None) or _state_for(os.environ.get("CLAUDE_PROJECT_DIR"))
    if state is None:
        return 0
    try:
        proc = subprocess.run([sys.executable, str(ADAPTER), "compact-resume"], input=raw, capture_output=True,
                              text=True, cwd=str(state.parent), timeout=TIMEOUT,
                              env={**os.environ, "SIKSTACK_ROOT": str(state)})
        sys.stdout.write(proc.stdout)
    except Exception:  # noqa: BLE001 - the hook never fails
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
