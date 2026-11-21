#!/usr/bin/env python3
"""The rules-card SessionStart hook (matcher `startup|resume`). Its stdout reaches the main session as context.

- Inside a repo with a `.sikstack/` (found from the session's `cwd`, the hook's stdin, else `$CLAUDE_PROJECT_DIR`,
  walking up the way the engine does): the card, which is the plugin's `contract.md` (the one copy of the contract)
  plus one line on how to start. At most 4,096 bytes.
- Elsewhere: one line saying sikstack is installed and how to start (an old `workflow/` install above gets the
  `sikstack migrate` line instead).
- First, when setup left the registration pending in `$CLAUDE_PLUGIN_DATA`, it retries it once with a short timeout.

Never blocks or fails the session: every error ends in exit 0."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
CONTRACT = PLUGIN_ROOT / "contract.md"
STATE_DIR = ".sikstack"
OLD_MARKER = Path("workflow") / ".agentic-nested.json"
START_LINE = "This repo has a sikstack workspace: start or continue with `/sikstack:sik-mode` (it reads `sikstack next`)."
OUTSIDE_LINE = ("sikstack is installed, but no .sikstack/ workspace is here: `/sikstack:sik-mode` starts one in a git "
                "repo (`sikstack init`){setup}.")
OLD_LINE = ("sikstack is installed, and {where} holds an old workflow/ install: `sikstack migrate` there prints the "
            "move into .sikstack/ (a dry run), and `sikstack migrate --apply` makes it.")


def _walk(start):
    """("state", <.sikstack>) or ("old", <folder>) for the nearest match from `start` up, else None."""
    if not start:
        return None
    try:
        here = Path(start).resolve()
    except (OSError, RuntimeError):
        return None
    for d in (here, *here.parents):
        if (d / STATE_DIR).is_dir():
            return "state", d / STATE_DIR
        if (d / OLD_MARKER).is_file():
            return "old", d
    return None


def card(state: Path) -> str:
    text = CONTRACT.read_text(encoding="utf-8").rstrip("\n")
    return f"{text}\n\n{START_LINE}\n"


def main() -> int:
    try:
        raw = sys.stdin.read()
    except Exception:  # noqa: BLE001
        raw = ""
    try:
        hook = json.loads(raw or "null")
    except ValueError:
        hook = None
    data_dir = os.environ.get("CLAUDE_PLUGIN_DATA") or ""
    if data_dir and os.path.isdir(data_dir):
        try:
            sys.path.insert(0, str(PLUGIN_ROOT / "scripts"))
            sys.dont_write_bytecode = True
            import wf_setup
            wf_setup.retry_pending(data_dir)
        except Exception:  # noqa: BLE001 - the card still prints
            pass
    cwd = hook.get("cwd") if isinstance(hook, dict) else None
    found = _walk(cwd if isinstance(cwd, str) else None) or _walk(os.environ.get("CLAUDE_PROJECT_DIR"))
    try:
        if found and found[0] == "state":
            sys.stdout.write(card(found[1]))
        elif found:
            sys.stdout.write(OLD_LINE.format(where=found[1]) + "\n")
        else:
            set_up = bool(data_dir) and (Path(data_dir) / "install.json").is_file()
            sys.stdout.write(OUTSIDE_LINE.format(setup="" if set_up else "; `/sikstack:setup` registers this machine once") + "\n")
    except Exception:  # noqa: BLE001 - the hook never fails
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
