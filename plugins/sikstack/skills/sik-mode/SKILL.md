---
name: sik-mode
description: "Start or continue sikstack in this repo: reads `sikstack next` and routes to init, a new phase, the phase in flight, or the operator's waiting stop. Use when the operator says sik-mode, asks to work in phases, or asks what is next."
argument-hint: "[what you want done, in one line]"
allowed-tools: Bash(sikstack:*), Bash(sikstack-adapter:*), Read, Edit, Write, Glob, Grep, Bash, Agent
---

# sik-mode

Read the contract first: `${CLAUDE_PLUGIN_ROOT}/contract.md` (its four invariants always hold). Then run `sikstack next` and route on what it prints. The operator's ask, if any: $ARGUMENTS

- **`no sikstack workspace found`** → offer `sikstack init` (it makes `.sikstack/` here, hidden from git, and commits nothing in the repo); run it on the operator's yes, or at once when they already asked for work here. Then `sikstack next` again.
- **`holds an old workflow/ install`** → relay the line; the move is `sikstack migrate`, the operator's call.
- **`WAITING ON OPERATOR`**, or `acceptance_gate=open` → relay the stop or the walkthrough as `next` prints it, and stop: only the operator's own words clear it.
- **`no active slice`** (nothing planned) with an ask → follow `${CLAUDE_PLUGIN_ROOT}/skills/create-phase/SKILL.md` for it. With no ask, say the workspace is idle and ask what to do.
- **A phase in flight** (a current slice) → follow `${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phase/SKILL.md`.

Read a skill named here as a file and follow it; the Skill tool may refuse it (those skills are operator-invoked). The mode word stays the operator's: `auto` (the default) takes your own recommendations and lists them; `gate` stops for each plan. Dispatch agents by their prefixed names (`sikstack:slice-executor`, `sikstack:Explore`), with the model and effort `sikstack-adapter route` prints.
