#!/usr/bin/env python3
"""The plugin's guard, a PreToolUse hook on Bash (a plugin's settings.json permissions are ignored, R5). It denies a
force push (`--force`, `-f`, `--force-with-lease`, `--force-if-includes`, a `+refspec`) and `rm -rf` / `rm -fr` (any
rm with both a recursive and a force flag), each with a one-line reason; it allows `playwright-cli` and its pinned
install when that is the whole command; everything else passes through untouched (no output, exit 0).

Reads the hook's JSON on stdin; prints at most one JSON object. Never fails: a bad input passes through."""
from __future__ import annotations

import json
import re
import shlex
import sys

PLAYWRIGHT_INSTALLS = ("npm install -g @playwright/cli@0.1.25", "npm i -g @playwright/cli@0.1.25")
FORCE_FLAGS = ("--force", "--force-with-lease", "--force-if-includes")
SEPARATORS = re.compile(r"\|\||&&|[;|&\n()`]|\$\(")
WRAPPERS = ("sudo", "command", "exec", "nohup", "time", "xargs")


def _segments(command: str) -> list:
    """Each simple command of a shell line, as tokens (quotes respected where shlex can read them)."""
    out = []
    for part in SEPARATORS.split(command):
        part = part.strip()
        if not part:
            continue
        try:
            tokens = shlex.split(part, comments=True)
        except ValueError:
            tokens = part.split()
        while tokens and (tokens[0] in WRAPPERS or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[0]) or tokens[0] == "env"):
            tokens = tokens[1:]
        if tokens:
            out.append(tokens)
    return out


def _git_push_args(tokens: list):
    """The arguments after `push` when the tokens are a `git ... push` call, else None."""
    if not tokens or tokens[0].rsplit("/", 1)[-1] != "git":
        return None
    i = 1
    while i < len(tokens) and tokens[i].startswith("-"):
        i += 2 if tokens[i] in ("-C", "-c", "--git-dir", "--work-tree", "--namespace") else 1
    if i < len(tokens) and tokens[i] == "push":
        return tokens[i + 1:]
    return None


def _force_push(args: list) -> bool:
    for a in args:
        if a == "--":
            continue
        if a in FORCE_FLAGS or any(a.startswith(f + "=") for f in FORCE_FLAGS):
            return True
        if re.fullmatch(r"-[A-Za-z]+", a) and "f" in a[1:]:
            return True
        if a.startswith("+") and len(a) > 1:
            return True
    return False


def _rm_rf(tokens: list) -> bool:
    if not tokens or tokens[0].rsplit("/", 1)[-1] != "rm":
        return False
    recursive = force = False
    for a in tokens[1:]:
        if a == "--":
            break
        if a in ("--recursive",):
            recursive = True
        elif a == "--force":
            force = True
        elif re.fullmatch(r"-[A-Za-z]+", a):
            recursive = recursive or "r" in a or "R" in a
            force = force or "f" in a
    return recursive and force


def decide(command: str):
    """("deny" | "allow", reason) or None to pass through."""
    for tokens in _segments(command):
        push = _git_push_args(tokens)
        if push is not None and _force_push(push):
            return "deny", ("sikstack guard: a force push rewrites shared history and is never run by an agent; "
                            "push normally, or ask the operator to run it themselves")
        if _rm_rf(tokens):
            return "deny", ("sikstack guard: rm -rf is never run by an agent; remove the named files one by one, "
                            "or ask the operator")
    stripped = command.strip()
    if stripped in PLAYWRIGHT_INSTALLS:
        return "allow", "sikstack guard: the pinned playwright-cli install"
    if not SEPARATORS.search(stripped) and not re.search(r"[<>]", stripped):
        try:
            first = shlex.split(stripped)[:1]
        except ValueError:
            first = []
        if first == ["playwright-cli"]:
            return "allow", "sikstack guard: playwright-cli, the agent's own headless browser"
    return None


def main() -> int:
    try:
        hook = json.loads(sys.stdin.read() or "null")
        if not isinstance(hook, dict) or hook.get("tool_name") != "Bash":
            return 0
        command = (hook.get("tool_input") or {}).get("command")
        if not isinstance(command, str):
            return 0
        verdict = decide(command)
    except Exception:  # noqa: BLE001 - the guard never breaks a session; a bad input passes through
        return 0
    if verdict is None:
        return 0
    decision, reason = verdict
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": decision,
                                             "permissionDecisionReason": reason}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
