#!/usr/bin/env bash
# The sikstack plugin's smoke suite: the engine (scripts/), the Claude Code adapter (adapters/claude_code/), the
# hooks (hooks/), and the shipped skills, agents and contract, checked from the plugin's own folder.
#
# Every workspace here is made the way a user makes one: `sikstack init` in a scratch git repo under $TMPDIR, so
# its state is that repo's `.sikstack/` (its own git repo, nested in the repo). A test that names a workspace `$F`
# means that `.sikstack/` folder, run from inside it (the engine walks up to the nearest `.sikstack/`, which is
# itself); the product repo around it is `$F/..`. Test numbers follow the workspace suite this was ported from
# (bootstrap_agentic_workspace's tests/retrofit_smoke.sh at v102).
#
# Cut with the installer (sikstack ships no installer: the plugin is the install, `sikstack init` makes the state):
#   1-3 (retrofit, its idempotence, a foreign scripts/workflow.py), 4 (docs seeding over a docs system),
#   6-7 (dual-apply and the built installer), 8 (--with-explain), 15-16 (--nested installs and their --update),
#   12 (the at-root worktree: there is no at-root workspace any more; the nested worktree is 11, 14, 17 and 28),
#   and the install/--update/--to-multi-repo parts of 5, 17, 19, 23 and 25. Test 0's pins moved to
#   tests/static_pins.py, less the installer's own; Test 29 is new (the finder, init, the hooks, the shipped text), and
#   so are Test 30 (setup, the registration retry, the rules card) and Test 31 (migrate from an old install).
#
# Usage:  bash plugins/sikstack/tests/smoke.sh        (alone in its shell call: never chained)
# Exit 0 if every check passes; non-zero otherwise. Re-runnable; self-cleaning.

set -u
export PYTHONDONTWRITEBYTECODE=1   # keep scratch repos free of __pycache__/

PLUGIN="${SMOKE_PLUGIN_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REPO_ROOT="$PLUGIN"                       # the old suite's name for the source root
ENG="$PLUGIN/scripts/workflow.py"         # `sikstack`
ADP="$PLUGIN/adapters/claude_code/adapter.py"   # `sikstack-adapter`
SK="$PLUGIN/bin/sikstack"
SKA="$PLUGIN/bin/sikstack-adapter"
export PATH="$PLUGIN/bin:$PATH"   # the bare commands the engine prints (`sikstack ...`) run as printed
export ENG ADP PLUGIN
unset SIKSTACK_ROOT WORKFLOW_CMD

FAILS=0
TMPDIRS=()
cleanup() { for d in "${TMPDIRS[@]:-}"; do [ -n "${d:-}" ] && rm -rf "$d"; done; }
trap cleanup EXIT

ok()  { printf 'PASS: %s\n' "$1"; }
bad() { printf 'FAIL: %s\n' "$1"; FAILS=$((FAILS + 1)); }
newtmp() { local _d; _d=$(mktemp -d); TMPDIRS+=("$_d"); printf -v "$1" '%s' "$_d"; }
sha_stdin() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print $1}'
  else sha256sum | awk '{print $1}'; fi
}
sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}
engine_src() { cat "$PLUGIN"/scripts/*.py; }
# The adapter owns route, meter and compact-resume; a wrapper that runs both picks the entry by the first word.
wf_entry() { case "$1" in route|meter|compact-resume) printf '%s' "$ADP" ;; *) printf '%s' "$ENG" ;; esac; }
# git reads one scratch global config here: an identity (CI has none), `main` as the first branch, no user hooks.
newtmp GITHOME
printf '[user]\n\temail = smoke@example.invalid\n\tname = smoke\n[init]\n\tdefaultBranch = main\n' > "$GITHOME/gitconfig"
export GIT_CONFIG_GLOBAL="$GITHOME/gitconfig" GIT_CONFIG_NOSYSTEM=1
# mkhost <dir>: a scratch product repo at <dir> (one empty commit) with its workspace made by `sikstack init`.
mkhost() {
  mkdir -p "$1" && git -C "$1" init -q \
    && { git -C "$1" rev-parse -q --verify HEAD >/dev/null || git -C "$1" commit -q --allow-empty -m "chore: start"; } \
    && ( cd "$1" && python3 "$ENG" init >/dev/null )
}
# mkws <var>: a workspace for a test that once ran on an at-root install. The variable names a folder to make
# (or an empty one); the repo goes there and the variable is set to its `.sikstack/`, the state folder.
mkws() { local _h="${!1}"; mkhost "$_h" || return 1; printf -v "$1" '%s' "$_h/.sikstack"; }
# set_link <.sikstack> <server>: write the cloud link the way `link` does, as config.toml's [cloud] table (replacing one).
set_link() { python3 - "$1/config.toml" "$2" <<'PY'
import re, sys
path, server = sys.argv[1:]
text = re.sub(r"\n*\[cloud\]\n(?:[^\[\n][^\n]*\n|\n)*", "\n", open(path).read()).rstrip("\n") + "\n"
open(path, "w").write(text + f'\n[cloud]\nschema = 1\nserver = "{server}"\norg_id = "org-1"\nproject_id = "proj-1"\nlinked_at = "2026-11-18T00:00:00Z"\n')
PY
}

command -v git >/dev/null 2>&1 || { echo "git is required to run this smoke test"; exit 2; }

# ---------------------------------------------------------------------------
echo "== Test 0: the shipped text pins -- tests/static_pins.py over the plugin's skills, agents, contract, templates and engine source, every failing pin reported =="
t0_out=$(python3 - "$PLUGIN/tests/static_pins.py" "$PLUGIN" <<'PY' 2>&1
import ast, sys
path, plugin = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()
ns = {"__name__": "static_pins"}
sys.argv = [path, plugin]
fails = 0
for node in ast.parse(src).body:
    try:
        exec(compile(ast.Module(body=[node], type_ignores=[]), path, "exec"), ns)
    except Exception as e:  # one line per failing statement: where, what, the first line of the statement
        fails += 1
        first = (ast.get_source_segment(src, node) or "").split("\n")[0][:120]
        print(f"static_pins.py:{node.lineno}: {type(e).__name__}: {str(e)[:200]} :: {first}")
print(f"statements={len(ast.parse(src).body)} failed={fails}")
sys.exit(1 if fails else 0)
PY
); t0_rc=$?
if [ "$t0_rc" = 0 ]; then ok "the plugin's text pins hold ($(printf '%s\n' "$t0_out" | tail -1)): 17 skills and their invocation metadata, the skill directories (cores of 8,192 B or less, every named reference shipped), the playbooks, agents and contract wording, the contract's 4,096 B cap"
else printf '%s\n' "$t0_out"; bad "a shipped text pin failed (lines above)"; fi

# ---------------------------------------------------------------------------
echo "== Test 5: a fresh workspace (sikstack init): it validates, seeds no phase, and the gate, the kinds, rotate, archive, the route table, the meter, --help, the resume card and the typed stop hold =="
newtmp F
mkws F >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && ok "sikstack init makes a workspace (exit 0)" || bad "sikstack init exit=$rc"
( cd "$F" && python3 "$ENG" check --no-rebuild >/dev/null 2>&1 ) && ok "fresh workspace validates" || bad "fresh workspace failed validate"
nphf=$(find "$F/works/phases/active" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
[ "$nphf" = "0" ] && ok "fresh install seeds no phases (empty start)" || bad "fresh install seeded $nphf phase(s)"
seed_er=$(cd "$F" && python3 "$ADP" route 2>&1)
printf '%s\n' "$seed_er" | grep -qE '^mid +sikstack:slice-executor +opus +medium +default$' && ! printf '%s\n' "$seed_er" | grep -q '^cheap ' \
  && ! printf '%s\n' "$seed_er" | grep -q '^override=' \
  && ok "a fresh install has no cheap row (v83) and its mid row is opus@medium, with no override= line" || bad "a fresh install's route table or override lines wrong: $seed_er"
# v32 operator acceptance gate, probed once against a real engine (throwaway workspace).
( cd "$F" && python3 "$ENG" phase new --phase P1 --name "Gate probe" --objective "probe the gate" >/dev/null 2>&1 ) \
  && grep -q '"acceptance"' "$F/works/phases/active/P1/phase.json" && ok "phase new stamps the acceptance gate block" || bad "phase new did not stamp the acceptance block"
( cd "$F" && python3 "$ENG" review P1 --verdict pass 2>&1 | grep -q 'gate P1 require' ) \
  && ok "review --verdict pass refuses an undeclared acceptance gate" || bad "an undeclared acceptance gate did not refuse the pass"
( cd "$F" && python3 "$ENG" gate P1 waive >/dev/null 2>&1 ) && bad "gate waive should require --note" || ok "gate waive without --note is rejected"
# The v34 kind set, probed against the same throwaway engine. slice new makes an unknown kind with one
# advice: line naming the set (exit 0); validate() only WARNS of it; promote-deferred still refuses one.
uk=$( cd "$F" && python3 "$ENG" slice new --phase P1 --slice P1.S9 --name "typo" --kind cowork 2>&1 ); uk_rc=$?
[ "$uk_rc" -eq 0 ] && [ -d "$F/works/phases/active/P1/slices/P1.S9" ] \
  && [ "$(printf '%s\n' "$uk" | grep -c '^advice: kind cowork is not one of co-work, decomposition, docs, fix, implementation, qa, research, review; it routes on the high row$')" -eq 1 ] \
  && ok "slice new makes an unknown --kind with one advice: line naming the set, research included (exit 0)" || bad "slice new on an unknown --kind (rc $uk_rc) -- $uk"
rm -r "$F/works/phases/active/P1/slices/P1.S9" && ( cd "$F" && python3 "$ENG" check >/dev/null 2>&1 )
# promote-deferred --create-phase creates the phase BEFORE the slice, so the kind must be
# rejected before that happens -- otherwise a typo leaves a half-created phase behind.
( cd "$F" && python3 "$ENG" defer-job --id D1 --title "kind probe" --reason r --trigger t --source manual >/dev/null 2>&1 ) || bad "defer-job probe failed"
( cd "$F" && python3 "$ENG" promote-deferred D1 --phase P8 --slice P8.S1 --name x --kind cowork --create-phase 2>&1 | grep -q "invalid slice kind: cowork" ) \
  && [ ! -d "$F/works/phases/active/P8" ] \
  && ok "promote-deferred rejects an unknown --kind before --create-phase creates the phase" \
  || bad "promote-deferred left a half-created phase behind on an unknown --kind"
( cd "$F" && python3 "$ENG" slice new --phase P1 --slice P1.S1 --name "design round" --kind co-work >/dev/null 2>&1 ) \
  && ok "slice new accepts --kind co-work (absent from history, present in the set)" || bad "slice new rejected --kind co-work"
# v36 research kind: in the set (the advice above names it) and creatable.
( cd "$F" && python3 "$ENG" slice new --phase P1 --slice P1.S2 --name "learn first" --kind research --risk high >/dev/null 2>&1 ) \
  && grep -q '"kind": "research"' "$F/works/phases/active/P1/slices/P1.S2/slice.json" \
  && ok "slice new accepts --kind research (v36, findings-only, always the high tier)" || bad "slice new rejected --kind research"
# Doc consolidation is retired: a passing review stamps no debt, and a phase.json still carrying an older
# install's `consolidation: "pending"` is ignored -- validate passes,
# next names no debt, and the phase archives like any other.
( cd "$F" && python3 "$ENG" phase new --phase P2 --name "Old debt probe" --objective "probe" >/dev/null 2>&1 \
  && python3 "$ENG" gate P2 waive --note "probe" >/dev/null 2>&1 \
  && python3 "$ENG" slice status P2.DECOMP done >/dev/null 2>&1 \
  && python3 "$ENG" slice status P2.REVIEW done >/dev/null 2>&1 \
  && python3 "$ENG" review P2 --verdict pass >/dev/null 2>&1 ) || bad "old-debt probe: could not pass P2"
! grep -q '"consolidation"' "$F/works/phases/active/P2/phase.json" \
  && ok "a passing review stamps no doc-consolidation debt" || bad "the passing review stamped a consolidation field"
python3 - "$F/works/phases/active/P2/phase.json" <<'PY2'
import json, sys
p = sys.argv[1]
d = json.load(open(p)); d["consolidation"] = "pending"; d["consolidates"] = ["P1"]
json.dump(d, open(p, "w"), indent=2)
PY2
old_next=$( cd "$F" && python3 "$ENG" next 2>&1 ); old_val=$( cd "$F" && python3 "$ENG" check --no-rebuild 2>&1 ); old_rc=$?
[ "$old_rc" -eq 0 ] && ! printf '%s\n%s\n' "$old_next" "$old_val" | grep -q "consolidation\|stale_docs\|oversized_doc_sections" \
  && ok "an older install's consolidation fields are ignored: validate passes and neither next nor validate names a debt" \
  || bad "the retired consolidation fields were read (rc=$old_rc): $old_val"
# phase rotate (v54; the docs-phase branches retired with the debt): rotate=archive is its one result off a
# parallel stream, archiving every cleanly archivable phase and leaving the open ones. Probed on a copy.
newtmp ROT; cp -R "$F/../." "$ROT/"; ROT="$ROT/.sikstack"
rot_out=$( cd "$ROT" && python3 "$ENG" phase rotate 2>&1 ); rot_rc=$?
[ "$rot_rc" -eq 0 ] && [ "$(printf '%s\n' "$rot_out" | head -1)" = "rotate=archive" ] && printf '%s\n' "$rot_out" | grep -q "^rotated 1 done phase(s) to archived:" \
  && [ ! -d "$ROT/works/phases/active/P2" ] && [ -d "$ROT/works/phases/active/P1" ] \
  && ( cd "$ROT" && python3 "$ENG" check --no-rebuild >/dev/null 2>&1 ) \
  && ok "phase rotate prints rotate=archive and archives the done phase (its old consolidation stamp ignored), leaving the open one" \
  || bad "phase rotate did not archive the done phase with rotate=archive (rc=$rot_rc): $rot_out"
( cd "$ROT" && python3 "$ENG" phase rotate --archive-only 2>&1 | grep -q "^rotate=" ) \
  && bad "phase rotate --archive-only printed a rotate= line" \
  || ok "phase rotate --archive-only prints no rotate= line"
( cd "$F" && python3 "$ENG" phase archive P2 >/dev/null 2>&1 ) && [ ! -d "$F/works/phases/active/P2" ] \
  && ok "phase archive archives a phase carrying an older install's consolidation stamp" || bad "phase archive held a phase on a retired consolidation stamp"
# The fixture becomes a git repo here; the later dashboard test re-inits it harmlessly.
( cd "$F" && git init -q . >/dev/null 2>&1 && git add -A >/dev/null 2>&1 \
    && git -c user.email=smoke@example.invalid -c user.name=smoke commit -qm "fixture baseline" >/dev/null 2>&1 ) \
  || bad "could not make the fixture a git repo"
python3 - "$F/works/phases/active/P1/slices/P1.S1/slice.json" <<'PY2'
import json, sys
p = sys.argv[1]
d = json.load(open(p)); d["kind"] = "invented-by-an-adopter"
json.dump(d, open(p, "w"), indent=2)
PY2
kind_out=$( cd "$F" && python3 "$ENG" check --no-rebuild 2>&1 ); kind_rc=$?
printf '%s\n' "$kind_out" | grep -q "unknown kind 'invented-by-an-adopter'" && [ "$kind_rc" -eq 0 ] \
  && ok "validate warns on an unknown kind and still exits 0 (adopting history survives)" \
  || bad "validate did not warn exit-code-neutrally on an unknown kind (rc=$kind_rc)"
python3 - "$F/works/phases/active/P1/slices/P1.S1/slice.json" <<'PY2'
import json, sys
p = sys.argv[1]
d = json.load(open(p)); d["kind"] = "co-work"
json.dump(d, open(p, "w"), indent=2)
PY2
# v53 route table: .sikstack/config.toml's [claude.<row>] tables override the adapter's rows key by key, and route prints
# the routing decision, writing nothing (sync-agents retired with the installer: every row is passed per dispatch). Its
# probes unset the environment variables it reads, so a run inside an ocx session (a loopback ANTHROPIC_BASE_URL) or on
# Bedrock still sees the plain table.
erenv() { env -u ANTHROPIC_BASE_URL -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE -u CLAUDE_CODE_USE_BEDROCK -u CLAUDE_CODE_USE_VERTEX -u CLAUDE_CODE_USE_FOUNDRY -u ANTHROPIC_DEFAULT_HAIKU_MODEL "$@"; }
er() { ( cd "$F" && erenv python3 "$ADP" route "$@" 2>&1 ); }
printf '[claude.high]\nmodel = "fable"\n' > "$F/config.toml"; er_out=$(er P1.DECOMP)
printf '%s\n' "$er_out" | grep -qx 'model=fable' && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:slice-executor' \
  && grep -q "^model: opus$" "$PLUGIN/agents/slice-executor.md" \
  && ok "a [claude.high] alias override shows in route and touches no agent file (the row is passed per dispatch)" \
  || bad "a [claude.high] override is missing from route, or an agent file changed: $er_out"
printf '[claude.high]\nmodel = "claude-opus-5-5"\n' > "$F/config.toml"
hi_out=$( cd "$F" && python3 "$ADP" route 2>&1 ); hi_rc=$?
[ "$hi_rc" -ne 0 ] && printf '%s\n' "$hi_out" | grep -q 'must be an Agent-tool alias' \
  && ok "a full model id on any row is refused (every row is passed per dispatch, so an alias only)" || bad "[claude.high] full id not refused (rc=$hi_rc): $hi_out"
printf '[notes]\nserver = "https://example.invalid"\n\n[claude.mid]\nmodel = "sonnet"\n' > "$F/config.toml"; er_out=$(er)
printf '%s\n' "$er_out" | grep -qE '^mid +sikstack:slice-executor +sonnet +medium +model config.toml / effort default$' \
  && ok "config.toml's other tables are skipped whole; its [claude.mid] row is read" || bad "a foreign table in config.toml broke route: $er_out"
printf 'mode = "flex"\n' > "$F/config.toml"
mode_out=$( cd "$F" && python3 "$ADP" route 2>&1 ); mode_rc=$?
[ "$mode_rc" -ne 0 ] && printf '%s\n' "$mode_out" | grep -q 'retired in workspace v53' \
  && ok "a leftover mode = line is refused with the v53 migration message" || bad "mode = \"flex\" was not refused with the v53 migration (rc=$mode_rc): $mode_out"
printf '[claude.low]\nmodel = "sonnet"\n' > "$F/config.toml"
( cd "$F" && python3 "$ADP" route 2>&1 | grep -q 'retired in workspace v23' ) && ok "retired [claude.low] section rejected with a migration message" || bad "[claude.low] should be rejected as a retired tier"
printf '[codex.high]\nmodel = "gpt-5.6-sol"\n' > "$F/config.toml"
( cd "$F" && python3 "$ADP" route 2>&1 | grep -q 'removed in workspace v31' ) && ok "leftover [codex.*] section rejected with the v31 migration message" || bad "[codex.*] should be rejected as removed support"
printf '[claude.cheap]\nmodel = "haiku"\n' > "$F/config.toml"
( cd "$F" && python3 "$ADP" route 2>&1 | grep -q 'the cheap row was retired in workspace v83' ) \
  && ok "a leftover [claude.cheap] is refused with the v83 migration message" || bad "[claude.cheap] should be rejected as a retired row"
printf '[claude.research]\nmodel = "claude-opus-5-5"\n' > "$F/config.toml"
( cd "$F" && python3 "$ADP" route 2>&1 | grep -q 'must be an Agent-tool alias' ) \
  && ok "a full model id on the research row is refused (it runs a file the mid row owns, so an alias only)" || bad "[claude.research] accepted a full model id"
printf '[claude.research]\neffort = "hgih"\n' > "$F/config.toml"
( cd "$F" && python3 "$ADP" route 2>&1 | grep -q 'effort must be one of' ) \
  && ok "an effort outside the Agent tool's levels is refused" || bad "[claude.research] accepted an unknown effort"
printf '[claude.nope]\nmodel = "opus"\n' > "$F/config.toml"
( cd "$F" && python3 "$ADP" route 2>&1 | grep -q 'unknown route' ) \
  && ok "an unknown [claude.<row>] is refused" || bad "[claude.nope] was accepted"
rm -f "$F/config.toml"
er_out=$(er)
[ "$(printf '%s\n' "$er_out" | grep -cE '^(high|research|design|critic|judge|mid|explore) ')" = "7" ] && ! printf '%s\n' "$er_out" | grep -q '^cheap ' && printf '%s\n' "$er_out" | grep -qx 'proxy=none' \
  && printf '%s\n' "$er_out" | grep -qE '^route +agent +model +effort +source$' \
  && printf '%s\n' "$er_out" | grep -qE '^design +sikstack:design-drafter +fable +high +default$' \
  && printf '%s\n' "$er_out" | grep -qE '^critic +sikstack:design-critic +opus +high +default$' && printf '%s\n' "$er_out" | grep -qE '^judge +sikstack:design-critic +opus +high +default$' \
  && printf '%s\n' "$er_out" | grep -qE '^high +sikstack:slice-executor +opus +high +default$' && printf '%s\n' "$er_out" | grep -qE '^research +sikstack:slice-executor +opus +high +default$' \
  && printf '%s\n' "$er_out" | grep -qE '^mid +sikstack:slice-executor +opus +medium +default$' \
  && printf '%s\n' "$er_out" | grep -qE '^explore +sikstack:Explore +haiku +xhigh +default$' \
  && ! printf '%s\n' "$er_out" | grep -q '^warning=fairness' && ! printf '%s\n' "$er_out" | grep -q 'tier' && ! printf '%s\n' "$er_out" | grep -q '^fallback=' \
  && ok "route (bare) prints the seven-row route table with its agent column, no tier and no cheap row (v80 defaults: every opus row @high, mid opus@medium, explore haiku@xhigh; v83) and proxy=none" || bad "route bare table wrong: $er_out"
er_out=$(er P1.DECOMP)
printf '%s\n' "$er_out" | grep -qx 'route=high' && ! printf '%s\n' "$er_out" | grep -q '^tier=' \
  && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:slice-executor' && printf '%s\n' "$er_out" | grep -qx 'model=opus' \
  && printf '%s\n' "$er_out" | grep -qx 'effort=high' && printf '%s\n' "$er_out" | grep -qx 'attribution=Claude Opus 5.5' \
  && ok "route sends a decomposition slice to the high row (slice-executor, opus@high, Claude Opus 5.5, no tier= line)" || bad "route P1.DECOMP wrong: $er_out"
er_out=$(er P1.S2)
printf '%s\n' "$er_out" | grep -qx 'route=research' && printf '%s\n' "$er_out" | grep -qx 'effort=high' \
  && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:slice-executor' \
  && ok "route sends a research slice to the research row (slice-executor, opus@high)" || bad "route research slice wrong: $er_out"
( cd "$F" && python3 "$ENG" slice new --phase P1 --slice P1.S9 --name "docs probe" --kind docs --risk low >/dev/null 2>&1 ) \
  || bad "route probe: slice new P1.S9 (docs, low) failed"
er_out=$(er P1.S9)
printf '%s\n' "$er_out" | grep -qx 'route=mid' && printf '%s\n' "$er_out" | grep -qx 'reason=kind docs rated low' && ! printf '%s\n' "$er_out" | grep -q '^tier=' \
  && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:slice-executor' && printf '%s\n' "$er_out" | grep -qx 'model=opus' \
  && printf '%s\n' "$er_out" | grep -qx 'effort=medium' && printf '%s\n' "$er_out" | grep -qx 'attribution=Claude Opus 5.5' && ! printf '%s\n' "$er_out" | grep -q '^fallback=' \
  && ok "a low docs slice runs on the mid row, opus@medium (v83: no Haiku slice row)" || bad "route low docs slice wrong: $er_out"
er_out=$( cd "$F" && erenv CLAUDE_CODE_USE_BEDROCK=1 python3 "$ADP" route P1.S9 2>&1 )
er_x=$( cd "$F" && erenv CLAUDE_CODE_USE_FOUNDRY=1 python3 "$ADP" route --explore 2>&1 )
printf '%s\n' "$er_out" | grep -qx 'model=opus' && ! printf '%s\n' "$er_out" | grep -q '^fallback=' \
  && printf '%s\n' "$er_x" | grep -qx 'model=haiku' && ! printf '%s\n' "$er_x" | grep -q '^fallback=' \
  && ok "on Bedrock and Foundry nothing falls back: a low docs slice stays on the mid row and explore keeps haiku" || bad "platform fallback wrong: $er_out / $er_x"
er_out=$(er P1.S9 --retry)
printf '%s\n' "$er_out" | grep -qx 'route=high' && printf '%s\n' "$er_out" | grep -qx 'attempt=2' && printf '%s\n' "$er_out" | grep -qx 'reason=second attempt' \
  && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:slice-executor' && printf '%s\n' "$er_out" | grep -qx 'model=opus' \
  && ok "route --retry sends a second attempt to the high row (the same slice-executor, on opus)" || bad "route --retry wrong: $er_out"
printf '[claude.mid]\nmodel = "sonnet"\neffort = "high"\n' > "$F/config.toml"
er_out=$(er P1.S9)
printf '%s\n' "$er_out" | grep -qx 'model=sonnet' && printf '%s\n' "$er_out" | grep -qx 'attribution=Claude Sonnet 5.5' \
  && ok "a [claude.mid] override carries a low docs slice with it (sonnet, attributed to Claude Sonnet 5.5)" || bad "route mid override on a docs slice wrong: $er_out"
er_out=$( cd "$F" && env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE ANTHROPIC_BASE_URL=http://127.0.0.1:10100 python3 "$ADP" route P1.S9 2>&1 )
printf '%s\n' "$er_out" | grep -qx 'model=sonnet' && ! printf '%s\n' "$er_out" | grep -q '^fallback=' \
  && ok "behind a loopback ANTHROPIC_BASE_URL (ocx/Kiro) a slice row never falls back" || bad "route proxy moved a slice row: $er_out"
er_out=$(er)
printf '%s\n' "$er_out" | grep -qx 'override=mid sonnet@high (default opus@medium)' && [ "$(printf '%s\n' "$er_out" | grep -c '^override=')" = "1" ] \
  && ok "the bare table prints an override= line for the row executors.toml pins, beside its default" || bad "route override= line wrong: $er_out"
printf '[claude.mid]\nmodel = "opus"\neffort = "medium"\n' > "$F/config.toml"
er_out=$(er)
printf '%s\n' "$er_out" | grep -q '^override=mid opus@medium same as the default ' \
  && ok "a row set to its default prints override=... same as the default" || bad "route same-as-default override wrong: $er_out"
er_out=$( cd "$F" && env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE ANTHROPIC_BASE_URL=http://127.0.0.1:10100 python3 "$ADP" route --explore 2>&1 )
printf '%s\n' "$er_out" | grep -qx 'model=sonnet' && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:Explore' \
  && ok "behind the same proxy route --explore falls back to sonnet" || bad "route --explore proxy fallback wrong: $er_out"
er_out=$(er --drafter)
printf '%s\n' "$er_out" | grep -qx 'agent=design-drafter' && printf '%s\n' "$er_out" | grep -qx 'route=design' \
  && ! printf '%s\n' "$er_out" | grep -q '^tier=' && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:design-drafter' \
  && printf '%s\n' "$er_out" | grep -qx 'model=fable' && printf '%s\n' "$er_out" | grep -qx 'effort=high' \
  && ok "route --drafter names design-drafter on its own design row (no tier= line, fable@high)" || bad "route --drafter wrong: $er_out"
# v96: a phase's `Drafter:` line under intent.md's ## Design Style picks the drafter's model at the design row's
# effort; no line is the design row; behind a loopback proxy (no Fable) a Fable drafter falls back to opus.
cp "$F/works/phases/active/P1/intent.md" "$F/intent.bak"
er_out=$(er --drafter --phase P1)
printf '%s\n' "$er_out" | grep -qx 'model=fable' && printf '%s\n' "$er_out" | grep -qx 'drafter_source=design row' \
  && ok "route --drafter --phase on a phase naming no drafter is the design row (fable)" || bad "route --drafter --phase default wrong: $er_out"
printf '\n## Design Style\n\nbuild-after: one flow.\nMockup: on request\nDrafter: opus\n' >> "$F/works/phases/active/P1/intent.md"
er_out=$(er --drafter --phase P1)
printf '%s\n' "$er_out" | grep -qx 'model=opus' && printf '%s\n' "$er_out" | grep -qx 'drafter_source=phase P1 Drafter: opus' \
  && ok "a phase's Drafter: opus keeps Opus against the Fable default" || bad "route --drafter --phase opus wrong: $er_out"
cp "$F/intent.bak" "$F/works/phases/active/P1/intent.md"
printf '\n## Design Style\n\nbuild-after: one flow.\nMockup: on request\nDrafter: fable\n' >> "$F/works/phases/active/P1/intent.md"
er_out=$(er --drafter --phase P1)
printf '%s\n' "$er_out" | grep -qx 'model=fable' && printf '%s\n' "$er_out" | grep -qx 'effort=high' \
  && printf '%s\n' "$er_out" | grep -qx 'attribution=Claude Fable 5.2' && printf '%s\n' "$er_out" | grep -qx 'drafter_source=phase P1 Drafter: fable' \
  && ok "a phase's Drafter: fable dispatches the drafter on fable at the design row's effort" || bad "route --drafter --phase fable wrong: $er_out"
er_out=$( cd "$F" && env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE ANTHROPIC_BASE_URL=http://127.0.0.1:10100 python3 "$ADP" route --drafter --phase P1 2>&1 )
printf '%s\n' "$er_out" | grep -qx 'model=opus' && printf '%s\n' "$er_out" | grep -q '^fallback=design model fable -> opus ' \
  && ok "behind a loopback proxy a Fable drafter falls back to opus" || bad "route --drafter proxy fallback wrong: $er_out"
er_c=$(er --critic --phase P1); er_crc=$?
[ "$er_crc" -ne 0 ] && printf '%s\n' "$er_c" | grep -q 'goes with --drafter only' \
  && ok "--phase without --drafter is refused" || bad "route --critic --phase not refused (rc=$er_crc): $er_c"
sed 's/^Drafter: fable$/**Drafter:** fable/' "$F/works/phases/active/P1/intent.md" > "$F/intent.tmp" && mv "$F/intent.tmp" "$F/works/phases/active/P1/intent.md"
er_out=$(er --drafter --phase P1)
printf '%s\n' "$er_out" | grep -qx 'model=fable' \
  && ok "a bold **Drafter:** label is read, never dropped for its form" || bad "route --drafter dropped a bold Drafter: line: $er_out"
sed 's/^\*\*Drafter:\*\* fable$/Drafter: haiku/' "$F/works/phases/active/P1/intent.md" > "$F/intent.tmp" && mv "$F/intent.tmp" "$F/works/phases/active/P1/intent.md"
er_out=$(er --drafter --phase P1); er_rc=$?
[ "$er_rc" -ne 0 ] && printf '%s\n' "$er_out" | grep -q "names the drafter 'haiku'" \
  && ok "a Drafter: other than fable or opus is refused" || bad "route --drafter accepted Drafter: haiku (rc=$er_rc): $er_out"
{ cat "$F/intent.bak"; printf '\n### Design style notes\n\nfrom the brief.\n\n## Design Style\n\nDrafter: fable\n'; } > "$F/works/phases/active/P1/intent.md"
er_out=$(er --drafter --phase P1)
printf '%s\n' "$er_out" | grep -qx 'model=fable' \
  && ok "an earlier '### Design style' subsection never hides the real section's Drafter: line" || bad "route --drafter lost the real Design Style section: $er_out"
mv "$F/intent.bak" "$F/works/phases/active/P1/intent.md"
# P36.S5B, P39.S1, v75: the critic and the judge both run design-critic; either may share the drafter's model.
er_out=$(er --critic); er_j=$(er --judge)
printf '%s\n' "$er_out" | grep -qx 'route=critic' && printf '%s\n' "$er_out" | grep -qx 'subagent_type=sikstack:design-critic' \
  && printf '%s\n' "$er_out" | grep -qx 'model=opus' && printf '%s\n' "$er_out" | grep -qx 'effort=high' \
  && printf '%s\n' "$er_j" | grep -qx 'route=judge' && printf '%s\n' "$er_j" | grep -qx 'subagent_type=sikstack:design-critic' \
  && printf '%s\n' "$er_j" | grep -qx 'model=opus' && printf '%s\n' "$er_j" | grep -qx 'effort=high' && ! printf '%s\n' "$er_j" | grep -q '^tier=' \
  && ok "route --critic (opus@high) and --judge (opus@high) both dispatch design-critic" || bad "route --critic/--judge wrong: $er_out / $er_j"
printf '[claude.critic]\nmodel = "opus"\neffort = "xhigh"\n' > "$F/config.toml"
er_out=$( cd "$F" && env -u ANTHROPIC_BASE_URL python3 "$ADP" route --critic 2>&1 ); er_rc=$?
[ "$er_rc" -eq 0 ] && printf '%s\n' "$er_out" | grep -qx 'model=opus' \
  && ! printf '%s\n' "$(er)" | grep -q '^warning=fairness' \
  && ok "a critic on the drafter's model is accepted (exit 0, model=opus) and the bare table does not warn (v75)" || bad "the critic on the drafter's model was refused or warned (rc=$er_rc): $er_out"
rm -f "$F/config.toml"
# P39.S1: the judge is exempt from the critic-vs-drafter rule -- at the defaults it is Opus over the Opus drafter.
er_out=$( cd "$F" && env -u ANTHROPIC_BASE_URL -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE python3 "$ADP" route --judge 2>&1 ); er_rc=$?
[ "$er_rc" -eq 0 ] && printf '%s\n' "$er_out" | grep -qx 'model=opus' && ! printf '%s\n' "$er_out" | grep -q 'warning=fairness' \
  && ! printf '%s\n' "$er_out" | grep -q '^skip=' \
  && ok "the judge on the drafter's model (opus over opus) is allowed: route --judge exits 0 with no fairness warning" || bad "route --judge refused or warned at the defaults (rc=$er_rc): $er_out"
# The loopback-proxy skip needs a Fable judge: it never fires at the default (Opus), only on a Fable override.
er_out=$( cd "$F" && env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE ANTHROPIC_BASE_URL=http://127.0.0.1:10100 python3 "$ADP" route --judge 2>&1 ); er_rc=$?
[ "$er_rc" -eq 0 ] && ! printf '%s\n' "$er_out" | grep -q '^skip=' \
  && ok "behind a loopback proxy the default (opus) judge prints no skip= and exits 0" || bad "route --judge proxy at the default wrong (rc=$er_rc): $er_out"
printf '[claude.judge]\nmodel = "fable"\n' > "$F/config.toml"
er_out=$( cd "$F" && env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE ANTHROPIC_BASE_URL=http://127.0.0.1:10100 python3 "$ADP" route --judge 2>&1 ); er_rc=$?
[ "$er_rc" -eq 0 ] && printf '%s\n' "$er_out" | grep -q '^skip=yes reason=loopback ' \
  && ok "behind a loopback proxy (no Fable) a Fable-overridden judge prints skip=yes and exits 0" || bad "route --judge proxy skip wrong (rc=$er_rc): $er_out"
rm -f "$F/config.toml"
( cd "$F" && env -u ANTHROPIC_BASE_URL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE CLAUDE_CODE_EFFORT_LEVEL=high python3 "$ADP" route P1.DECOMP 2>&1 | grep -q '^warning=CLAUDE_CODE_EFFORT_LEVEL' ) \
  && ok "route warns that CLAUDE_CODE_EFFORT_LEVEL outranks every per-dispatch effort" || bad "route did not warn on CLAUDE_CODE_EFFORT_LEVEL"
cp "$PLUGIN/templates/config.toml" "$F/config.toml"
er_out=$(er)
printf '%s\n' "$er_out" | grep -qE '^mid +sikstack:slice-executor +opus +medium +default$' && ! printf '%s\n' "$er_out" | grep -q '^agent files' \
  && ! printf '%s\n' "$er_out" | grep -q '^override=' \
  && ok "the shipped config.toml seed sets no row: the defaults, no override= line" || bad "route on the shipped config.toml seed wrong: $er_out"
( cd "$F" && python3 "$ENG" executor-mode 2>&1 | grep -q 'invalid choice' ) \
  && ok "executor-mode is gone from the engine (v53: route replaces it)" || bad "the engine still accepts executor-mode"
# v61 transcript meter (P37.S2), the adapter's `meter` since the thin engine: it meters the main thread and the
# spans from Claude Code's transcripts -- one request per message id with its largest output, spans attributed by
# their `slice:` line, list-priced (an unknown model never guessed), a span ending on a usage limit is `limit` --
# and reads each slice's verdict from its result.md (the status: line) or slice.json. record-dispatch is retired.
rd() { ( cd "$F" && CLAUDE_CONFIG_DIR="$F/.no-claude-config" python3 "$(wf_entry "$1")" "$@" 2>&1 ); }
( cd "$F" && python3 "$ADP" record-dispatch P1.DECOMP --verdict done >/dev/null 2>&1 ); rc1=$?
( cd "$F" && python3 "$ENG" record-dispatch P1.DECOMP --verdict done >/dev/null 2>&1 ); rc2=$?
[ "$rc1" -eq 2 ] && [ "$rc2" -eq 2 ] && ok "record-dispatch is retired: the adapter and the engine both exit 2" || bad "record-dispatch still runs (adapter rc=$rc1, engine rc=$rc2)"
printf -- '- status: escalate\n- summary: probe\n' > "$F/works/phases/active/P1/slices/P1.DECOMP/result.md"
ds_out=$(rd meter --phase P1); ds_rc=$?; ds_one=$(rd meter --slice P1.DECOMP)
rm -f "$F/works/phases/active/P1/slices/P1.DECOMP/result.md"
[ "$ds_rc" -eq 0 ] && printf '%s\n' "$ds_out" | grep -q '^transcripts=none found under ' && printf '%s\n' "$ds_out" | grep -qE '^decomposition +1 +0 +1 +0 +0 +0$' \
  && printf '%s\n' "$ds_one" | grep -qx 'slice=P1.DECOMP kind=decomposition verdict=escalate source=result.md' \
  && ok "meter with no transcripts: one line, then each slice's verdict read from its result.md status: line" || bad "meter without transcripts wrong (rc=$ds_rc): $ds_out / $ds_one"
rd meter --phase P7 >/dev/null; rc1=$?
[ "$rc1" -eq 1 ] && ok "meter --phase: an unknown phase exits 1" || bad "meter --phase P7 rc=$rc1"
newtmp MT
cp -R "$F/.." "$MT/host" && ln -s host/.sikstack "$MT/ws"
( cd "$MT/ws" && python3 "$ENG" slice new --phase P1 --slice P1.S7 --name "meter probe" --kind implementation --risk low >/dev/null 2>&1 )
python3 - "$MT" <<'PY'
import json, os, sys
mt = sys.argv[1]
ev = os.path.join(mt, "ws", "works", "events.jsonl")
with open(ev, "a") as f:
    for ts, old, new in (("2026-01-01T10:00:00+00:00", "todo", "in_progress"), ("2026-01-01T11:00:00+00:00", "in_progress", "done")):
        f.write(json.dumps({"ts": ts, "type": "slice_status_changed", "slice": "P1.S7", "old_status": old, "new_status": new}) + "\n")
proj = os.path.join(mt, "projects", "-fixture")
sub = os.path.join(proj, "sess1", "subagents")
os.makedirs(sub)
def asst(ts, mid, model, out, cr=0, w1h=0, w5=0, inp=0, content=None, stop="end_turn"):
    return {"type": "assistant", "timestamp": ts, "message": {"id": mid, "model": model, "content": content or [], "stop_reason": stop,
            "usage": {"input_tokens": inp, "cache_read_input_tokens": cr, "cache_creation_input_tokens": w1h + w5,
                      "cache_creation": {"ephemeral_1h_input_tokens": w1h, "ephemeral_5m_input_tokens": w5}, "output_tokens": out}}}
def user(ts, text):
    return {"type": "user", "timestamp": ts, "message": {"role": "user", "content": text}}
def write(path, rows):
    with open(path, "w") as f:
        f.write("".join(json.dumps(r) + "\n" for r in rows))
write(os.path.join(proj, "sess1.jsonl"), [
    user("2026-01-01T10:29:00.000Z", "go"),
    asst("2026-01-01T10:30:00.000Z", "m1", "claude-opus-5-5", 5, cr=1000000, w1h=100000, inp=10),
    asst("2026-01-01T10:30:01.000Z", "m1", "claude-opus-5-5", 500, cr=1000000, w1h=100000, inp=10),
    asst("2026-01-01T10:31:00.000Z", "m2", "claude-opus-5-5", 100, inp=1000)])
write(os.path.join(sub, "agent-aaa.jsonl"), [
    user("2026-01-01T10:35:00.000Z", "slice: P1.S7\nfolder: works/phases/active/P1/slices/P1.S7"),
    asst("2026-01-01T10:40:00.000Z", "s1", "claude-opus-5-5", 50, inp=2000, content=[{"type": "text", "text": "Done.\n- status: done"}]),
    asst("2026-01-01T10:41:00.000Z", "s3", "claude-opus-5-5", 3, inp=500, stop=None)])  # a stream-start entry: no final usage ever follows
json.dump({"agentType": "slice-executor-high", "model": "opus", "effort": "high", "finished": True}, open(os.path.join(sub, "agent-aaa.meta.json"), "w"))
write(os.path.join(sub, "agent-bbb.jsonl"), [
    user("2026-01-01T10:41:00.000Z", "round: 01-x/01-x\nslice: P1.S7"),
    asst("2026-01-01T10:42:00.000Z", "s2", "claude-mystery-1", 10, inp=100),
    {"type": "assistant", "timestamp": "2026-01-01T10:43:00.000Z", "error": "rate_limit", "isApiErrorMessage": True,
     "message": {"id": "syn1", "model": "<synthetic>", "content": [{"type": "text", "text": "You've hit your session limit · resets 3:10am (Asia/Seoul)"}],
                 "usage": {"input_tokens": 0, "output_tokens": 0}}}])
json.dump({"agentType": "design-drafter", "model": "opus", "effort": "xhigh", "finished": True}, open(os.path.join(sub, "agent-bbb.meta.json"), "w"))
open(os.path.join(mt, "ws", "works", "phases", "active", "P1", "slices", "P1.S7", "result.md"), "w").write("# P1.S7\n\n- status: done\n- summary: probe\n")
PY
mt_json=$( cd "$MT/ws" && python3 "$ADP" meter --phase P1 --json --transcripts "$MT/projects/-fixture" 2>&1 )
printf '%s\n' "$mt_json" | python3 -c '
import json, sys
d = json.load(sys.stdin)["metered"]["slices"]["P1.S7"]
m = d["main"]
assert m["requests"] == 2 and m["output"] == 600, m
spans = {s["agent"]: s for s in d["spans"]}
assert spans["slice-executor-high"]["slice"] == "P1.S7" and spans["slice-executor-high"]["attributed_by"] == "slice-line", spans
assert spans["slice-executor-high"]["outcome"] == "done", spans
assert spans["design-drafter"]["outcome"] == "limit" and spans["design-drafter"]["reset"] == "3:10am (Asia/Seoul)", spans
assert spans["design-drafter"]["usage"]["requests"] == 1 and spans["design-drafter"]["usage"]["unpriced"] == 1, spans
u = spans["slice-executor-high"]["usage"]
assert u["requests"] == 2 and u["no_final"] == 1 and u["output_floor"] is True and spans["design-drafter"]["usage"]["output_floor"] is False, u
assert m["output_floor"] is False, m
' && printf '%s\n' "$mt_json" | python3 -c '
import json, sys
v = json.load(sys.stdin)["verdicts"]
assert v["slices"]["P1.S7"] == {"kind": "implementation", "verdict": "done", "source": "result.md"}, v["slices"]
assert v["by_kind"]["implementation"]["done"] >= 1, v["by_kind"]
' && ok "the meter: two main-thread ids from three entries keep the largest output, spans attributed by their slice: line, a span ending on a usage limit is limit with its reset; a finished slice's result.md reads done" || bad "the transcript meter miscounted: $mt_json"
mt_out=$( cd "$MT/ws" && python3 "$ADP" meter --phase P1 --transcripts "$MT/projects/-fixture" 2>&1 )
printf '%s\n' "$mt_out" | grep -qE '^main +- +2 +1\.10M +600 +1\.02 ' && printf '%s\n' "$mt_out" | grep -qE '^design-drafter +1 +1 +100 +10 +\? ' \
  && ok "meter prices the main thread at list price (\$1.02) and leaves an unknown model unpriced (?)" || bad "meter pricing wrong: $mt_out"
printf '%s\n' "$mt_out" | grep -qE '^note=output_floor spans=1/3 \(33%\) main=0/2 ' && printf '%s\n' "$mt_out" | grep -qE '^slice-executor-high +1 +2 +[^ ]+ +≥53 +≥[0-9.]+ ' \
  && ! printf '%s\n' "$mt_out" | grep -E '^(main|design-drafter) ' | grep -q '≥' \
  && ok "meter flags a span request that never logged a final usage: the note= count and the ≥ floor on that group only" || bad "meter floor note/mark wrong: $mt_out"
# v66: a DECOMP estimates time, not session-$, and writes a `spends money:` line per slice; the [means] header says so.
grep -q 'never a session-\$ figure' "$PLUGIN/skills/do-whole-phase/reference/decomposition.md" \
  && grep -q 'spends money:' "$PLUGIN/skills/do-whole-phase/playbooks/decompose.md" && ! grep -q '\$ per span' "$PLUGIN/skills/do-whole-phase/playbooks/decompose.md" \
  && grep -q 'a DECOMP estimates time from these' "$PLUGIN/adapters/claude_code/adapter.py" \
  && ok "a DECOMP estimates time only and writes a per-slice spends-money line (the orchestrator reference, the decompose playbook, the [means] header)" || bad "the DECOMP time-only / spends-money wording is missing or a session-\$ estimate remains"
# v66: one slice-executor runs every slice row, so the meter reads its route from the kind and the model
# (research by kind, haiku as cheap, the high row's family as high, else mid); an old slice-executor-high
# span keeps its reading. v80: on the defaults high and mid are both opus, so the span's effort tells them apart.
rm -f "$MT/ws/config.toml"
python3 - "$MT" <<'PY'
import json, os, sys
proj = os.path.join(sys.argv[1], "projects", "-fixture2")
sub = os.path.join(proj, "sess2", "subagents")
os.makedirs(sub)
def row(ts, kind, payload):
    return json.dumps({"type": kind, "timestamp": ts, "message": payload}) + "\n"
open(os.path.join(proj, "sess2.jsonl"), "w").write(row("2026-01-01T10:29:00.000Z", "user", {"role": "user", "content": "go"}))
for n, (agent, model, sid, effort) in enumerate((("slice-executor", "claude-opus-5-5", "P1.S7", "high"), ("slice-executor", "claude-opus-5-5", "P1.S7", "medium"),
                                                 ("slice-executor", "claude-haiku-5-5", "P1.S7", None), ("slice-executor", "claude-opus-5-5", "P1.S2", None),
                                                 ("slice-executor-high", "claude-opus-5-5", "P1.S7", None), ("slice-executor", "claude-sonnet-5-5", "P1.S7", None))):
    ts = f"2026-01-01T10:3{n}:00.000Z"
    with open(os.path.join(sub, f"agent-x{n}.jsonl"), "w") as f:
        f.write(row(ts, "user", {"role": "user", "content": f"slice: {sid}"}))
        f.write(row(ts, "assistant", {"id": f"x{n}", "model": model, "content": [{"type": "text", "text": "- status: done"}], "stop_reason": "end_turn",
                                      "usage": {"input_tokens": 10, "output_tokens": 5}}))
    json.dump({"agentType": agent, "finished": True, **({"effort": effort} if effort else {})}, open(os.path.join(sub, f"agent-x{n}.meta.json"), "w"))
PY
mt2=$( cd "$MT/ws" && python3 "$ADP" meter --phase P1 --json --transcripts "$MT/projects/-fixture2" 2>&1 )
printf '%s\n' "$mt2" | python3 -c '
import json, sys
slices = json.load(sys.stdin)["metered"]["slices"]
routes = {s["id"]: (s["agent"], s["route"]) for d in slices.values() for s in d["spans"]}
assert routes == {"x0": ("slice-executor", "high"), "x1": ("slice-executor", "mid"), "x2": ("slice-executor", "cheap"),
                  "x3": ("slice-executor", "research"), "x4": ("slice-executor-high", "high"), "x5": ("slice-executor", "mid")}, routes
' && ok "the meter reads slice-executor spans by kind, model and effort (opus@high high, opus@medium mid, haiku cheap, sonnet mid, a research slice research) and still reads an old slice-executor-high span" \
  || bad "the meter misread slice-executor routes: $mt2"
# A minted, tailed slice id (P<n>-<tail>.S1) attributes by its `slice:` line, and meter --phase takes the
# brief name (the bare number, while one phase holds it).
mt_tok=$( cd "$MT/ws" && python3 "$ENG" phase new --name "Meter token" --objective probe 2>&1 | sed -n 's/^created phase \(P[^:]*\):.*/\1/p' )
mt_num=$(printf '%s\n' "$mt_tok" | sed -nE 's/^P([0-9]+)-[0-9a-z]{2}$/\1/p')
( cd "$MT/ws" && python3 "$ENG" slice new --phase "$mt_num" --slice S1 --name "token meter" --kind implementation --risk low ) >/dev/null 2>&1 || bad "token meter probe: slice new failed"
python3 - "$MT" "$mt_tok.S1" <<'PY'
import json, os, sys
sub = os.path.join(sys.argv[1], "projects", "-fixture2", "sess2", "subagents")
with open(os.path.join(sys.argv[1], "ws", "works", "events.jsonl"), "a") as f:  # the slice's window, so the phase filter finds the session
    for ts, old, new in (("2026-01-01T10:00:00+00:00", "todo", "in_progress"), ("2026-01-01T10:55:00+00:00", "in_progress", "done")):
        f.write(json.dumps({"ts": ts, "type": "slice_status_changed", "slice": sys.argv[2], "old_status": old, "new_status": new}) + "\n")
with open(os.path.join(sub, "agent-t0.jsonl"), "w") as f:
    f.write(json.dumps({"type": "user", "timestamp": "2026-01-01T10:50:00.000Z", "message": {"role": "user", "content": "slice: " + sys.argv[2]}}) + "\n")
    f.write(json.dumps({"type": "assistant", "timestamp": "2026-01-01T10:51:00.000Z", "message": {"id": "t0", "model": "claude-sonnet-5-5", "content": [{"type": "text", "text": "- status: done"}],
                                                                                              "stop_reason": "end_turn", "usage": {"input_tokens": 10, "output_tokens": 5}}}) + "\n")
json.dump({"agentType": "slice-executor", "finished": True}, open(os.path.join(sub, "agent-t0.meta.json"), "w"))
PY
mt3=$( cd "$MT/ws" && python3 "$ADP" meter --phase "$mt_num" --json --transcripts "$MT/projects/-fixture2" 2>&1 )
printf '%s\n' "$mt3" | python3 -c '
import json, sys
spans = [s for d in json.load(sys.stdin)["metered"]["slices"].values() for s in d["spans"]]
assert [(s["slice"], s["attributed_by"]) for s in spans] == [(sys.argv[1] + ".S1", "slice-line")], spans
' "$mt_tok" && [ -n "$mt_num" ] && ok "the meter attributes a minted, tailed slice id ($mt_tok.S1) by its slice: line, and meter --phase takes the bare number" \
  || bad "the meter did not attribute a minted slice id: $mt3"
# v61 pure compaction (P37.S3): compaction is Claude Code's own -- no PreCompact hook, no compact-gate. After
# a compaction the SessionStart hook runs the adapter's compact-resume, which prints the engine's resume card (`next --card`) with the running spans:
# computed from state, at most 2,048 B, naming files and never asking for a re-read. A pending stop is typed
# (slice status ... pending --stop-kind --on-words), printed by next and the card, cleared on leaving pending.
newtmp CGT
CG="$CGT/ws"
mkws CG >/dev/null 2>&1 \
  && ( cd "$CG" && python3 "$ENG" phase new --phase P1 --name "Card probe" --objective "probe the resume card" >/dev/null 2>&1 ) \
  || bad "resume card: could not build the fixture"
cg_help=$( cd "$CG" && python3 "$ENG" --help 2>&1 ); cg_help_rc=$?
( cd "$CG" && python3 "$ENG" compact-gate </dev/null >/dev/null 2>&1 ); cg_rc=$?
[ "$cg_help_rc" -eq 0 ] && printf '%s\n' "$cg_help" | grep -q 'next' && [ "$cg_rc" -ne 0 ] && ! printf '%s\n' "$cg_help" | grep -q 'compact-gate' && ! engine_src "$CG" | grep -qE 'cmd_compact_gate|AGENTIC_COMPACT_|COMPACT_RESUME_LINE' \
  && ok "compact-gate is gone from the engine (no subcommand, no knobs, no resume line)" || bad "compact-gate still present (rc=$cg_rc)"
# every subcommand's --help exits 0 (a crash in an argparse help string once hid behind a green suite);
# the list is the engine's own, read from the top-level help
( cd "$CG" && printf '%s\n' "$cg_help" | python3 -c '
import os, re, subprocess, sys
names = re.search(r"\{([^}]+)\}", " ".join(sys.stdin.read().split())).group(1).split(",")
bad = [n for n in names if subprocess.run([sys.executable, __import__("os").environ["ENG"], n, "--help"], capture_output=True).returncode != 0]
assert len(names) > 20 and not bad, bad
' ) && ok "every subcommand's --help exits 0 (the list read from the engine's own top-level help)" || bad "a subcommand's --help fails"
# W1: the engine's --help lists the eleven verbs and the three named parts' own commands, 41 in all, and no
# command of the Claude Code adapter (route, sync-agents, meter, compact-resume, nor their old names).
( printf '%s\n' "$cg_help" | python3 -c '
import re, sys
names = re.search(r"\{([^}]+)\}", " ".join(sys.stdin.read().split())).group(1).split(",")
verbs = {"init", "next", "phase", "slice", "section", "review", "gate", "pr", "worktree", "repo", "close", "check"}
design = {"design-init", "design-system", "design-open", "design-check", "design-canvas", "design-publish-plan", "design-preview",
          "design-readback", "design-sign", "design-close", "design-migrate"}
agenda = {"deferred", "defer-job", "promote-deferred", "drop-deferred", "agenda", "agenda-add", "agenda-edit", "agenda-move",
          "agenda-defer", "agenda-solve", "agenda-drop", "agenda-reopen", "agenda-delete", "agenda-link", "agenda-unlink"}
cloud = {"link", "unlink", "sync", "mark-committed"}
machine = {"setup", "migrate"}  # beside init, run before any workspace is found
assert len(names) == 44 and set(names) == verbs | design | agenda | cloud | machine, sorted(set(names) ^ (verbs | design | agenda | cloud | machine))
' ) && ok "the engine's --help lists 44 commands: init and the eleven verbs, setup and migrate, plus the design, agenda and cloud parts' own, no adapter command" \
  || bad "the engine's command list moved -- $(printf '%s\n' "$cg_help" | sed -n 2p)"
card_ok() { # card_ok <text>: at most 2,048 bytes, no re-read, the pointer, the next action and the file paths
  [ "$(printf '%s' "$1" | wc -c | tr -d ' ')" -le 2048 ] && ! printf '%s\n' "$1" | grep -qi 're-read' \
    && printf '%s\n' "$1" | grep -q '^pointer: phase P1 ' && printf '%s\n' "$1" | grep -q '^next action: ' \
    && printf '%s\n' "$1" | grep -q '^plan: .sikstack/works/phases/active/P1/slices/P1.DECOMP/plan.md' && printf '%s\n' "$1" | grep -q '^result: not yet' \
    && printf '%s\n' "$1" | grep -q '^phase: .sikstack/works/phases/active/P1/phase.md' && printf '%s\n' "$1" | grep -q '^intent: .sikstack/works/phases/active/P1/intent.md'
}
card=$( cd "$CG" && python3 "$ENG" next --card 2>&1 ); cr_rc=$?
[ "$cr_rc" -eq 0 ] && card_ok "$card" && printf '%s\n' "$card" | grep -q '^next action: slice start P1.DECOMP, then plan it' \
  && ! printf '%s\n' "$card" | grep -q '^running spans' && printf '%s\n' "$card" | grep -qF "pin its route (the adapter's \`route P1.DECOMP\`)" \
  && ok "next --card prints the resume card: <= 2,048 B, the pointer, the next action (plan it), the file paths, no re-read, no spans (the engine reads no transcript)" || bad "next --card wrong (rc=$cr_rc): $card"
( cd "$CG" && python3 "$ENG" slice start P1.DECOMP >/dev/null 2>&1 && printf 'the plan\n' > works/phases/active/P1/slices/P1.DECOMP/plan.md ) || bad "resume card: slice start failed"
mkdir -p "$CGT/proj/s1/subagents" && printf '{}\n' > "$CGT/proj/s1.jsonl"
printf '{"agentType":"slice-executor-high","description":"P1.DECOMP decomposition executor"}' > "$CGT/proj/s1/subagents/agent-a.meta.json"
printf '{"agentType":"Explore","description":"an old lookup","finished":true}' > "$CGT/proj/s1/subagents/agent-b.meta.json"
cr_out=$( cd "$CG" && printf '{"source":"compact","transcript_path":"%s","cwd":"%s"}' "$CGT/proj/s1.jsonl" "$CG" | python3 "$ADP" compact-resume 2>&1 ); cr_rc=$?
cr_card=$(printf '%s\n' "$cr_out" | sed 1d)
[ "$cr_rc" -eq 0 ] && [ "$(printf '%s\n' "$cr_out" | head -1)" = "compaction=done source=compact" ] && card_ok "$cr_card" \
  && printf '%s\n' "$cr_card" | grep -qx 'running spans: slice-executor-high: P1.DECOMP decomposition executor' \
  && printf '%s\n' "$cr_card" | grep -q '^next action: an executor is running (see spans): wait for its notification, never re-dispatch' \
  && ok "compact-resume (fake hook stdin) prints the card: running spans from the session's unfinished .meta.json only, wait -- never re-dispatch" || bad "compact-resume card wrong (rc=$cr_rc): $cr_out"
cr_out=$( cd "$CG" && printf 'not json' | python3 "$ADP" compact-resume 2>&1 ); cr_rc=$?
[ "$cr_rc" -eq 0 ] && printf '%s\n' "$cr_out" | head -1 | grep -qx 'compaction=done source=compact' && printf '%s\n' "$cr_out" | grep -q '^pointer: phase P1 ' \
  && ok "compact-resume on garbage stdin still prints the card and exits 0" || bad "compact-resume garbage stdin wrong (rc=$cr_rc): $cr_out"
( cd "$CG" && python3 "$ENG" slice status P1.DECOMP in_progress --stop-kind decision --on-words x >/dev/null 2>&1 ); tp_rc=$?
[ "$tp_rc" -ne 0 ] && ok "slice status refuses --stop-kind/--on-words without pending" || bad "slice status accepted --stop-kind without pending"
tp_set=$( cd "$CG" && python3 "$ENG" slice status P1.DECOMP pending --stop-kind decision --on-words "choose the design style; DECOMP records it and cuts the slices" 2>&1 ); tp_rc=$?
tp_next=$( cd "$CG" && python3 "$ENG" next 2>&1 )
tp_card=$( cd "$CG" && python3 "$ENG" next --card 2>&1 )
( cd "$CG" && python3 "$ENG" check --no-rebuild >/dev/null 2>&1 ); tp_val=$?
[ "$tp_rc" -eq 0 ] && [ "$tp_val" -eq 0 ] && python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))["pending"]; assert set(p)=={"kind","on_words","since"} and p["kind"]=="decision", p' "$CG/works/phases/active/P1/slices/P1.DECOMP/slice.json" \
  && printf '%s\n' "$tp_next" | grep -qx 'stop_kind=decision' && printf '%s\n' "$tp_next" | grep -qx 'on_words=choose the design style; DECOMP records it and cuts the slices' \
  && printf '%s\n' "$tp_card" | grep -q '^stop: decision (since .*) -- the operator.s words will: choose the design style' && [ "$(printf '%s' "$tp_card" | wc -c | tr -d ' ')" -le 2048 ] \
  && ok "a typed pending stop is stored as pending {kind, on_words, since}; next and the card print the kind and the words; validate passes" || bad "typed pending wrong (rc=$tp_rc val=$tp_val): $tp_set / $tp_next / $tp_card"
( cd "$CG" && python3 "$ENG" slice status P1.DECOMP in_progress >/dev/null 2>&1 ) \
  && python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert "pending" not in d and d["status"]=="in_progress", d' "$CG/works/phases/active/P1/slices/P1.DECOMP/slice.json" \
  && ok "leaving pending clears the typed record" || bad "the pending record survived slice status in_progress"
python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["pending"]={"kind":"nap","on_words":"x","since":"t"}; json.dump(d,open(p,"w"))' "$CG/works/phases/active/P1/slices/P1.DECOMP/slice.json"
tp_val=$( cd "$CG" && python3 "$ENG" check --no-rebuild 2>&1 ); tp_rc=$?
[ "$tp_rc" -ne 0 ] && printf '%s\n' "$tp_val" | grep -q 'carries a pending record' \
  && ok "validate rejects a pending record on a slice that is not pending" || bad "validate missed a stray pending record: $tp_val"

# ---------------------------------------------------------------------------
echo "== Test 9: v35 phase notebook -- template seed, generated ## Slices block, slice finish --outcome =="
# Runs against the fresh workspace from Test 5 ($F), which already carries the gate-probe P1 (P2 was archived above,
# and an archived id is spent since v73, so the notebook probe is P4).
sig() { python3 -c "import hashlib,os,sys;p=sys.argv[1];print(hashlib.sha256(open(p,'rb').read()).hexdigest(),os.stat(p).st_mtime_ns)" "$1"; }
PM="$F/works/phases/active/P4/phase.md"
( cd "$F" && python3 "$ENG" phase new --phase P4 --name "Notebook" --objective "notebook probe" >/dev/null 2>&1 )
grep -q '<!-- slices:begin -->' "$PM" && grep -q '<!-- slices:end -->' "$PM" && grep -q '^## Now$' "$PM" \
  && ok "phase new seeds phase.md from the template (both markers + ## Now)" || bad "seeded phase.md is not the v35 shape"
grep -q '^| `P4.DECOMP` |' "$PM" && ok "phase new renders the generated ## Slices block" || bad "## Slices block was not filled on phase creation"
( cd "$F" && python3 "$ENG" slice new --phase P4 --slice P4.S1 --name "probe" >/dev/null 2>&1 )
out=$( cd "$F" && python3 "$ENG" slice finish P4.S1 --outcome "did X" 2>&1 )
grep -q '| did X |' "$PM" && ok "slice finish --outcome lands in the slice's generated row" || bad "outcome missing from the ## Slices row -- $out"
out=$( cd "$F" && python3 "$ENG" slice finish P4.DECOMP 2>&1 ); rc=$?
[ "$rc" -eq 0 ] && printf '%s\n' "$out" | grep -q '^warning: no --outcome recorded for P4.DECOMP' \
  && ok "slice finish without --outcome warns and still succeeds" || bad "omitted --outcome must warn, never fail (exit=$rc) -- $out"
before=$(sig "$PM"); ( cd "$F" && python3 "$ENG" check >/dev/null 2>&1 )
[ "$(sig "$PM")" = "$before" ] && ok "an unchanged phase.md is not rewritten by rebuild (no notebook churn)" || bad "rebuild rewrote an unchanged phase.md"
python3 - "$PM" <<'STRIP'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
p.write_text("\n".join(l for l in p.read_text().split("\n") if "slices:begin" not in l and "slices:end" not in l))
STRIP
before=$(sig "$PM"); ( cd "$F" && python3 "$ENG" check >/dev/null 2>&1 )
[ "$(sig "$PM")" = "$before" ] && ok "a marker-less phase.md is left byte-identical (legacy no-op, no migration)" || bad "rebuild touched a marker-less phase.md"
grep -qF '_Generated by `sikstack check` from each slice' "$PLUGIN/templates/works/phase.md" && grep -qF '_Generated by `sikstack check` from each slice' "$PM" \
  && ok "the notebook seed is the plugin's templates/works/phase.md, and its generated line names sikstack check" || bad "phase.md was not seeded from the plugin's template"

# ---------------------------------------------------------------------------
echo "== Test 10: v35/v39 notebook guardrails -- budget warning, no dashboard timestamp churn =="
# Continues on $F (P4's phase.md lost its markers in Test 9; irrelevant here). v39's cap is
# bytes-only (v61: 40 KB, an index), so the filler is generated, never checked in: pad the
# notebook past it in one edit.
python3 - "$PM" <<'PAD'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
p.write_text(p.read_text() + "\n## Filler\n\n" + "- filler\n" * 50_000)  # ~450 KB
PAD
out=$( cd "$F" && python3 "$ENG" check --no-rebuild 2>&1 ); rc=$?
[ "$rc" -eq 0 ] && ok "validate exits 0 with notebook warnings (warn, never error)" || bad "validate exited $rc on warnings -- $out"
printf '%s\n' "$out" | grep -q 'phase P4: phase.md is .* over the notebook budget of 40960 bytes; biggest sections: ## Filler ' \
  && ok "an over-budget phase.md warns (40 KB) and names its largest section" || bad "no over-budget warning naming the largest section -- $out"
( cd "$F" && python3 "$ENG" slice new --phase P4 --slice P4.S2 --name "budget probe" >/dev/null 2>&1 )
out=$( cd "$F" && python3 "$ENG" slice finish P4.S2 --outcome "probe" 2>&1 )
printf '%s\n' "$out" | grep -q '^phase.md: .* bytes (budget 40960 bytes)' && printf '%s\n' "$out" | grep -q 'OVER BUDGET' \
  && ok "slice finish prints the notebook size and flags it over budget" || bad "slice finish notebook size print missing -- $out"
printf '%s\n' "$out" | grep -q 'biggest sections: ## Filler ' && printf '%s\n' "$out" | grep -q 'topics/<slug>.md' \
  && ok "slice finish names the biggest sections and suggests topics/ when over budget" || bad "over-budget size line does not name the largest section -- $out"
grep -q 'Rebuilt at' "$F/backlog.md" "$F/works/deferred.md" "$F/works/agenda.md" \
  && bad "a markdown dashboard still carries a Rebuilt at timestamp" || ok "no Rebuilt at timestamp in any markdown dashboard (backlog, deferred, agenda)"
# The churn this removes: repeated `next` calls must not dirty the three dashboards.
( cd "$F" && git init -q . >/dev/null 2>&1 && git add -A >/dev/null 2>&1 \
    && git -c user.email=smoke@example.invalid -c user.name=smoke commit -qm "smoke baseline" >/dev/null 2>&1 )
( cd "$F" && python3 "$ENG" next >/dev/null 2>&1; python3 "$ENG" next >/dev/null 2>&1 )
tracked=$( cd "$F" && git ls-files backlog.md works/deferred.md works/agenda.md | wc -l | tr -d ' ' )
dirty=$( cd "$F" && git status --short -- backlog.md works/deferred.md works/agenda.md )
[ "$tracked" = "3" ] && [ -z "$dirty" ] \
  && ok "two next calls leave the dashboards byte-identical (no timestamp churn)" || bad "next dirtied the dashboards (tracked=$tracked) -- $dirty"

# ---------------------------------------------------------------------------
echo "== Test 10b: v61 section -- phase.md is an index, read and written one section at a time =="
# Runs on a copy of $F so the probe phase never reaches the later tests' pointer.
newtmp PSW; cp -R "$F/.." "$PSW/ws"; PW="$PSW/ws/.sikstack"; ps() { ( cd "$PW" && python3 "$ENG" section "$@" ); }
( cd "$PW" && python3 "$ENG" phase new --phase P8 --name "Index probe" --objective "section probe" >/dev/null 2>&1 )
PN="$PW/works/phases/active/P8/phase.md"
python3 - "$PN" <<'SEED'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text()
# an older notebook (before the retirement) also carries ## Doc impact: section still reads and appends to it
t = t.replace("## Operator Questions\n", "## Doc impact\n\n_One line per durable-truth change._\n\n## Operator Questions\n\n- **OQ1 (S1):** Should the probe keep the old shape?\n  A second line of context.\n- **OQ2 (S1):** Another one?\n", 1)
t = t.replace("## Now\n", "## Now\n\n- old now line\n", 1)
p.write_text(t)
SEED
out=$(ps P8); printf '%s\n' "$out" | grep -q 'Objective$' && printf '%s\n' "$out" | grep -q 'Operator Questions$' && printf '%s\n' "$out" | grep -q 'total' \
  && ok "section <P> lists the headings with their bytes and a total" || bad "section index wrong -- $out"
out=$(ps P8 Now); printf '%s\n' "$out" | grep -qx '## Now' && printf '%s\n' "$out" | grep -q 'old now line' && ! printf '%s\n' "$out" | grep -q '## Decisions' \
  && ok "section <P> Now prints that section, heading included, and nothing else" || bad "section Now wrong -- $out"
ps P8 nope >/dev/null 2>&1; rc=$?; [ "$rc" -eq 1 ] && ok "an unknown section exits 1" || bad "unknown section exit=$rc"
cp "$PN" "$PSW/before.md"
printf 'fresh now\n' | ps P8 Now --replace >/dev/null 2>&1
python3 - "$PSW/before.md" "$PN" <<'SPLICE'
import sys
old, new = (open(p, encoding="utf-8").read() for p in sys.argv[1:3])
cut = old.index("## Now\n")
assert new[:cut] == old[:cut], "bytes before ## Now changed"
assert new[cut:].startswith("## Now\n") and "fresh now" in new[cut:] and "old now line" not in new, "the section was not replaced"
SPLICE
[ $? -eq 0 ] && ok "--replace of Now keeps every byte before the section identical and swaps its body" || bad "--replace changed bytes outside the section"
printf 'mid decision\n' > "$PSW/dec.txt"; cp "$PN" "$PSW/before2.md"; ps P8 Decisions --replace --file "$PSW/dec.txt" >/dev/null 2>&1
python3 - "$PSW/before2.md" "$PN" <<'SPLICE2'
import re, sys
old, new = (open(p, encoding="utf-8").read() for p in sys.argv[1:3])
split = lambda t: re.split(r"(?m)^(?=## )", t)
a, b = split(old), split(new)
assert len(a) == len(b)
for x, y in zip(a, b):
    if x.startswith("## Decisions"):
        assert "mid decision" in y
    else:
        assert x == y, x[:30]
SPLICE2
[ $? -eq 0 ] && ok "--replace of a middle section (Decisions, from --file) leaves every other section byte-identical" || bad "--replace of Decisions touched another section"
printf 'x\n' | ps P8 Slices --replace >/dev/null 2>&1; rc=$?
[ "$rc" -ne 0 ] && ok "--replace refuses the generated Slices section" || bad "--replace of Slices was accepted"
cp "$PN" "$PSW/ao.md"; out=$(printf -- '- x\n' | ps P8 "Operator Questions" --replace 2>&1); rc=$?; ao=$(cmp -s "$PSW/ao.md" "$PN" && echo same); cp "$PSW/ao.md" "$PN"
[ "$rc" -eq 0 ] && [ -z "$ao" ] && [ "$(printf '%s\n' "$out" | grep -c '^advice: Operator Questions is append-only by custom; --resolve collapses an answered entry$')" -eq 1 ] \
  && ok "--replace of Operator Questions writes, with one advice: line (append-only by custom)" || bad "--replace of Operator Questions (rc $rc) -- $out"
printf 'x\n' | ps P8 Slices --append >/dev/null 2>&1; [ $? -ne 0 ] && ok "--append refuses the generated Slices section" || bad "--append of Slices was accepted"
printf '%s\n' '- widget.md: a new line (S1)' | ps P8 "Doc impact" --append >/dev/null 2>&1
ps P8 "Doc impact" | grep -q 'widget.md: a new line' && ok "--append adds a line to an older notebook's Doc impact" || bad "--append to Doc impact lost the line"
ps P8 "Operator Questions" --append <<'OQAPP' >/dev/null 2>&1
- **OQ3 (S2):** Third?
OQAPP
ps P8 "Operator Questions" | grep -q 'OQ3 (S2)' && ok "--append adds an Operator Questions entry" || bad "--append to Operator Questions lost the entry"
out=$(ps P8 --resolve OQ1 --pointer "Decisions line 2"); rc=$?
ps P8 "Operator Questions" > "$PSW/oq.txt"
[ "$rc" -eq 0 ] && grep -qx -- '- \*\*OQ1\*\* (resolved → Decisions line 2): Should the probe keep the old shape?' "$PSW/oq.txt" \
  && ! grep -q 'A second line of context' "$PSW/oq.txt" && grep -q 'OQ2 (S1)' "$PSW/oq.txt" && grep -q 'OQ3 (S2)' "$PSW/oq.txt" \
  && ok "--resolve collapses a two-line entry to one resolved line and leaves its neighbours" || bad "--resolve result wrong (rc=$rc) -- $(cat "$PSW/oq.txt")"
ps P8 --resolve OQ1 --pointer "again" >/dev/null 2>&1; [ $? -ne 0 ] && ok "a second --resolve of the same entry is refused" || bad "an already-resolved entry was resolved again"
ps P8 --resolve OQ9 --pointer "x" >/dev/null 2>&1; [ $? -ne 0 ] && ok "--resolve of a missing entry is refused" || bad "--resolve of a missing entry succeeded"
( cd "$PW" && python3 "$ENG" check --no-rebuild >/dev/null 2>&1 ) ; mkdir -p "$PW/works/phases/active/P8/topics" && printf '# topic\n' > "$PW/works/phases/active/P8/topics/contract.md"
out=$( cd "$PW" && python3 "$ENG" check --no-rebuild 2>&1 ); rc=$?
[ "$rc" -eq 0 ] && ! printf '%s\n' "$out" | grep -q 'P8' && ok "validate accepts a topics/ folder beside phase.md without a word" || bad "validate flagged topics/ (rc=$rc) -- $out"
python3 - "$PW/works/phases/active/P8/phase.md" <<'BIG'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); p.write_text(p.read_text() + "\n".join("- long decision line %d padding padding padding" % i for i in range(1500)) + "\n")
BIG
out=$( cd "$PW" && python3 "$ENG" check --no-rebuild 2>&1 )
printf '%s\n' "$out" | grep -q 'phase P8: phase.md is .* over the notebook budget of 40960 bytes; biggest sections: ## ' && printf '%s\n' "$out" | grep -q 'topics/<slug>.md' \
  && ok "a notebook over 40 KB warns in validate, names its biggest sections and points at topics/" || bad "no 40 KB warning with sections -- $out"
# Entries: --entry K --replace writes one entry, --to-topic moves entries losslessly behind gist lines, and
# every refusal writes nothing. On a fresh probe phase P9 with a small synthetic notebook.
( cd "$PW" && python3 "$ENG" phase new --phase P9 --name "Entry probe" --objective "entry probe" >/dev/null 2>&1 )
PE="$PW/works/phases/active/P9/phase.md"
python3 - "$PE" <<'SEED'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text()
dec = ("1. **Alpha:** the first decision, short enough to be its own gist.\n"
       "2. **Beta:** a long decision. " + "It carries detail the next slice reads only when it needs it. " * 12 + "\n"
       "   - a nested point under Beta\n"
       "3. [topics/x.md](topics/x.md)\n")
t = t.replace("`topics/breakdown.md`._\n", "`topics/breakdown.md`._\n\n" + dec, 1)
t = t.replace("Last on purpose._\n", "Last on purpose._\n\n- now line\n", 1)
p.write_text(t)
SEED
cp "$PE" "$PSW/e0.md"; printf 'the **Alpha** decision, replaced\n' | ps P9 Decisions --entry alpha --replace >/dev/null 2>&1
python3 - "$PSW/e0.md" "$PE" <<'ENTRY'
import sys
old, new = (open(p, encoding="utf-8").read() for p in sys.argv[1:3])
line = "1. **Alpha:** the first decision, short enough to be its own gist."
assert old.count(line) == 1 and new == old.replace(line, "1. the **Alpha** decision, replaced", 1), "bytes outside the entry changed"
ENTRY
[ $? -eq 0 ] && ok "--entry K --replace swaps only that entry (its marker kept) and leaves every other byte identical" || bad "--entry --replace touched bytes outside the entry"
cp "$PE" "$PSW/e1.md"
for refusal in "Decisions --to-topic decisions --entry 3" "Decisions --to-topic breakdown --entry 1" "Now --to-topic now" \
               "Doc_impact --to-topic notes"; do
  # shellcheck disable=SC2086
  set -- $refusal; sect=$(printf '%s' "$1" | tr '_' ' '); shift
  printf 'x\n' | ps P9 "$sect" "$@" >/dev/null 2>&1; rc=$?
  [ "$rc" -ne 0 ] && cmp -s "$PSW/e1.md" "$PE" && [ ! -e "$PW/works/phases/active/P9/topics" ] \
    && ok "section refuses $sect $* and writes nothing" || bad "section $sect $* was not refused cleanly (rc=$rc)"
done
out=$(ps P9 Decisions --entry 1 --remove 2>&1); rc=$?; dr=$(cmp -s "$PSW/e1.md" "$PE" && echo same); cp "$PSW/e1.md" "$PE"
[ "$rc" -eq 0 ] && [ -z "$dr" ] && printf '%s\n' "$out" | grep -qx 'advice: Decisions keeps every decision by custom: a superseded one is replaced in place (--entry K --replace)' \
  && ok "section Decisions --entry 1 --remove writes, with one advice: line" || bad "Decisions --entry 1 --remove (rc=$rc) -- $out"
ps P9 Decisions --to-topic decisions --entry 1-2 --dry-run >/dev/null 2>&1; dry_rc=$?
dry_clean=no; cmp -s "$PSW/e1.md" "$PE" && [ ! -e "$PW/works/phases/active/P9/topics" ] && dry_clean=yes
ps P9 Decisions --to-topic decisions --entry 1-2 >/dev/null 2>&1; mv_rc=$?
python3 - "$PSW/e1.md" "$PE" "$PW/works/phases/active/P9/topics/decisions.md" <<'MOVE'
import re, sys
old, new, topic = (open(p, encoding="utf-8").read() for p in sys.argv[1:4])
dec = lambda t: re.search(r"(?ms)^## Decisions\n.*?(?=^## )", t).group(0)
others = lambda t: t.replace(dec(t), "")
assert others(old) == others(new), "a section other than Decisions changed"
body = dec(old).split("\n")
starts = [i for i, l in enumerate(body) if re.match(r"\d+\. ", l)]
entries = ["\n".join(body[s:e]).rstrip("\n") for s, e in zip(starts, starts[1:] + [len(body)])]
for n, entry in enumerate(entries[:2], 1):
    assert f"## Decisions {n}\n\n{entry}\n" in topic, f"entry {n} is not verbatim in the topic"
    ptr = re.search(rf"(?m)^{n}\. (.+) → \[topics/decisions\.md\]\(topics/decisions\.md\) § Decisions {n}$", dec(new))
    assert ptr and len(re.sub(r"[*`]", "", ptr.group(1))) >= 24 and len(ptr.group(1)) <= 160, f"pointer {n} lacks a gist"
assert entries[2] in dec(new), "the unmoved entry changed"
MOVE
[ $? -eq 0 ] && [ "$dry_rc" -eq 0 ] && [ "$dry_clean" = yes ] && [ "$mv_rc" -eq 0 ] \
  && ok "--to-topic --dry-run writes nothing; the move puts each entry verbatim in topics/<slug>.md and leaves a pointer line with a gist" \
  || bad "--to-topic was not lossless (dry rc=$dry_rc clean=$dry_clean, move rc=$mv_rc)"
# Budgets and paging (design §4-§5): a probe phase P10 whose Decisions (~70 KB, one entry bigger than a
# page) is over its 12 KB budget, read in 24 KB pages; then a dangling pointer warns in validate.
( cd "$PW" && python3 "$ENG" phase new --phase P10 --name "Page probe" --objective "page probe" >/dev/null 2>&1 )
PP="$PW/works/phases/active/P10/phase.md"
python3 - "$PP" <<'SEED'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text()
dec = "".join(f"- **D{n}:** decision {n}. " + "detail " * 140 + "\n" for n in range(1, 41))
dec += "- **Huge:** " + "x" * 30000 + "\n\nA prose paragraph after the entries.\n"
t = t.replace("`topics/breakdown.md`._\n", "`topics/breakdown.md`._\n\n" + dec, 1)
p.write_text(t)
SEED
out=$(ps P10)
printf '%s\n' "$out" | grep -q '12288  over,long:41 Decisions$' && printf '%s\n' "$out" | grep -qx 'move: section P10 "Decisions" --to-topic decisions --entry 1-41' \
  && val=$( cd "$PW" && python3 "$ENG" check --no-rebuild 2>&1 ) && printf '%s\n' "$val" | grep -q 'phase P10: phase.md ## Decisions: .* over its 12288 B budget; long entries: 1, 2, 3, 4, 5, 6, 7, 8 +33 more; move: section P10 "Decisions"' \
  && ok "an over-budget section and its long entries are named, with the move command, by the index (heading last) and validate" || bad "budget report wrong -- $out"
pg_rc=0; ps P10 Decisions > "$PSW/plain.txt" || pg_rc=1; n=$(head -1 "$PSW/plain.txt" | sed -n 's/^<!-- page 1 of \([0-9]*\) · Decisions · entries 1–[0-9]* of 41 · next: section P10 "Decisions" --page 2 -->$/\1/p')
: > "$PSW/pages.txt"; for k in $(seq 1 "${n:-0}"); do ps P10 Decisions --page "$k" > "$PSW/page$k.txt" || pg_rc=1; done
python3 - "$PP" "$PSW" "${n:-0}" <<'PAGES'
import re, sys
text, d, n = open(sys.argv[1], encoding="utf-8").read(), sys.argv[2], int(sys.argv[3])
sec = re.search(r"(?ms)^## Decisions\n.*?(?=^## )", text).group(0).rstrip("\n") + "\n"
pages = [open(f"{d}/page{k}.txt", encoding="utf-8").read() for k in range(1, n + 1)]
assert n >= 3 and pages[0] == open(f"{d}/plain.txt", encoding="utf-8").read(), "a plain read is not page 1"
assert all(p.startswith("<!-- page ") for p in pages) and pages[-1].split("\n")[0].endswith("· last page -->")
assert "".join(p.split("\n", 1)[1] for p in pages) == sec, "the pages do not concatenate to the section"
for p in pages[1:]:
    assert re.match(r"(- \*\*|A prose)", p.split("\n", 1)[1]), "a page starts inside an entry"
assert any(len(p.encode()) > 24 * 1024 for p in pages), "the entry bigger than a page was split"
PAGES
[ $? -eq 0 ] && [ "$pg_rc" -eq 0 ] && ok "a section over 24 KB reads in pages: a plain read is page 1, pages break only between entries and concatenate to the section byte for byte" \
  || bad "paged read wrong (n=$n rc=$pg_rc) -- $(head -1 "$PSW/plain.txt" | cut -c1-200)"
cp "$PP" "$PSW/p0.md"; r1=0; r2=0; ps P10 Decisions --page 99 >/dev/null 2>&1 || r1=1; printf 'x\n' | ps P10 Decisions --page 1 --replace >/dev/null 2>&1 || r2=1
[ "$r1" -eq 1 ] && [ "$r2" -eq 1 ] && cmp -s "$PSW/p0.md" "$PP" && ok "--page out of range and --page with a write flag are refused, writing nothing" || bad "--page refusals wrong (range=$r1 write=$r2)"
ps P10 Decisions --to-topic decisions --entry 1 >/dev/null 2>&1
q=$( cd "$PW" && python3 "$ENG" check --no-rebuild 2>&1 | grep -c 'the moved entry is lost' ); rm "$PW/works/phases/active/P10/topics/decisions.md"
lost=$( cd "$PW" && python3 "$ENG" check --no-rebuild 2>&1 ); lost_rc=$?
[ "$q" = 0 ] && [ "$lost_rc" -eq 0 ] && printf '%s\n' "$lost" | grep -q 'phase P10: phase.md ## Decisions entry 1 points at topics/decisions.md, which does not exist: the moved entry is lost' \
  && ok "validate stays quiet on a good pointer and warns on a dangling one (a lost decision), exit 0" || bad "dangling-pointer warning wrong (quiet=$q rc=$lost_rc) -- $lost"
# The required step (design §6): over 40 KB, next / slice start / the card print it; silent under budget and when done.
newtmp NBW; cp -R "$F/.." "$NBW/ws"; NW="$NBW/ws/.sikstack"; rm -rf "$NW/works/phases/active/"* "$NW/works/phases/archived/"*; nb() { ( cd "$NW" && python3 "$ENG" "$@" ); }
nb phase new --phase P11 --name "Step probe" --objective "step probe" >/dev/null 2>&1; NP="$NW/works/phases/active/P11/phase.md"
nb slice start P11.DECOMP >/dev/null 2>&1; base=$(nb next 2>&1); base_card=$(nb next --card 2>&1)
python3 - "$NP" <<'SEED'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text()
dec = "".join(f"- **D{n}:** decision {n}. " + "detail " * 400 + "\n" for n in range(1, 18))
p.write_text(t.replace("`topics/breakdown.md`._\n", "`topics/breakdown.md`._\n\n" + dec, 1))
SEED
out=$(nb next 2>&1); card=$(nb next --card 2>&1); st=$(nb slice status P11.DECOMP todo >/dev/null 2>&1; nb slice start P11.DECOMP 2>&1)
printf '%s\n' "$out" | grep -q '^notebook_over_budget=P11 ([0-9]* of 40960 B) -- advice: move long entries to topics before the next dispatch (gists stay, nothing is lost)$' \
  && printf '%s\n' "$out" | grep -qx 'notebook_move=section P11 "Decisions" --to-topic decisions --entry 1-17' \
  && printf '%s\n' "$card" | grep -q '^notebook: over budget ([0-9]*/40960 B) -- run the notebook_move lines `next` prints before the next dispatch$' \
  && printf '%s\n' "$st" | grep -qx 'started P11.DECOMP' && printf '%s\n' "$st" | grep -q '^warning: notebook P11 is over budget ' \
  && ok "over 40 KB with a long entry, next prints the advice step and its move, the card one line, slice start a warning and still starts" || bad "advice step wrong -- $out / $st"
nb section P11 Decisions --to-topic decisions --entry 1-17 >/dev/null 2>&1
[ "$(nb next 2>&1)" = "$base" ] && [ "$(nb next --card 2>&1)" = "$base_card" ] \
  && ok "after the move the notebook is under budget and next and the card are byte-identical to before" || bad "under-budget next or card changed after the move"
python3 - "$NP" <<'SEED'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text()
oq = "".join(f"- **OQ{n} (S1):** question {n}? " + "context " * 400 + "\n" for n in range(1, 18))
p.write_text(t.replace("## Operator Questions\n", "## Operator Questions\n\n" + oq, 1))
SEED
out=$(nb next 2>&1)
printf '%s\n' "$out" | grep -q '^notebook_over_budget=P11 ([0-9]* of 40960 B) -- advisory: nothing left to move (Slices [0-9]* B generated; Operator Questions [0-9]* B: collapse answered entries with --resolve OQ<n> --pointer <ref>)$' \
  && ! printf '%s\n' "$out" | grep -q '^notebook_move=' \
  && ok "when nothing can move, next prints the advisory step and no notebook_move line" || bad "advisory step wrong -- $out"
nb phase status P11 done >/dev/null 2>&1
! nb next 2>&1 | grep -q 'notebook' && ! nb next --card 2>&1 | grep -q '^notebook:' \
  && ok "a done phase over budget prints no step in next or the card" || bad "a done phase still prints the step"

# ---------------------------------------------------------------------------
echo "== Test 10d: P42 the ready set -- an undeclared phase keeps its plain pointer, a declared dependency binds =="
# On a copy of $F emptied of its phases: P1 is undeclared (the pointer, as before); P2 is declared and read through next once P1 is done.
newtmp RSW; cp -R "$F/.." "$RSW/ws"; SW="$RSW/ws/.sikstack"; rm -rf "$SW/works/phases/active/"* "$SW/works/phases/archived/"*; rs() { ( cd "$SW" && python3 "$ENG" "$@" ); }
{ for n in 1 2; do rs phase new --phase "P$n" --name "Ready probe $n" --objective "ready probe" && rs slice finish "P$n.DECOMP" --outcome cut; done \
  && rs slice new --phase P1 --slice P1.S1 --name s1 && rs slice new --phase P1 --slice P1.S2 --name s2 \
  && rs slice new --phase P2 --slice P2.S1 --name s1 --depends-on none && rs slice new --phase P2 --slice P2.S2 --name s2 --depends-on P2.S1; } >/dev/null 2>&1 \
  || bad "ready-set probe: setup failed"
plain=$(rs next 2>&1); card=$(rs next --card 2>&1)
printf '%s\n' "$plain" | grep -qx 'current_slice=P1.S1' \
  && ! printf '%s\n%s\n' "$plain" "$card" | grep -q -e '^ready_slices=' -e '^running_slices=' -e '^wave: ' \
  && ok "an undeclared phase's ready set is its first open slice alone: next and the card print no ready, running or wave line" \
  || bad "undeclared phase output changed -- $plain / $card"
rs phase status P1 done >/dev/null 2>&1 || bad "ready-set probe: could not set P1 done"
r1=$(rs next 2>&1); rs slice start P2.S1 >/dev/null 2>&1; r2=$(rs next 2>&1); rs slice finish P2.S1 --outcome x >/dev/null 2>&1; r3=$(rs next 2>&1)
rs slice new --phase P2 --slice P2.S0 --name s0 --order 5 --depends-on P2.S2 >/dev/null 2>&1; fwd=$?
printf '%s\n' "$r1" | grep -qx 'ready_slices=P2.S1' && printf '%s\n' "$r2" | grep -qx 'ready_slices=none' && printf '%s\n' "$r2" | grep -qx 'running_slices=P2.S1' \
  && printf '%s\n' "$r3" | grep -qx 'ready_slices=P2.S2' && [ "$fwd" -ne 0 ] && [ ! -e "$SW/works/phases/active/P2/slices/P2.S0" ] \
  && ok "a declared slice is never ready before its dependency is done, and slice new refuses a dependency not ordered before it" \
  || bad "declared ready set wrong (fwd rc=$fwd) -- $r1 / $r2 / $r3"
{ rs slice start P2.S2 && rs slice finish P2.S2 --outcome x && rs slice start P2.REVIEW \
  && : > "$SW/works/phases/active/P2/slices/P2.REVIEW/result.md" && rs gate P2 require && rs gate P2 open --walkthrough probe; } >/dev/null 2>&1 \
  || bad "ready-set probe: could not open P2's acceptance gate"
gn=$(rs next 2>&1); gc=$(rs next --card 2>&1)
printf '%s\n' "$gn" | grep -qx 'waiting_on_operator=P2' && printf '%s\n' "$gc" | grep -q '^stop: phase P2 acceptance gate open ' \
  && ! printf '%s\n%s\n' "$gn" "$gc" | grep -q -e '^running_slices=' -e '^wave: ' \
  && ok "a declared phase at its open acceptance gate reads as a stop: the running REVIEW is a barrier, never a wave's running or returned slice" \
  || bad "declared gate reads as a wave -- $gn / $gc"
# v77: a decomposition that leaves a middle slice undeclared finishes with one advice: line naming it (it runs
# alone); slice deps declares one, and slice finish prints the engine's parallel plan. An explain phase is exempt.
{ rs phase new --phase P3 --name "Forced probe" --objective "forced declaration" && rs slice new --phase P3 --slice P3.S1 --name s1; } >/dev/null 2>&1 \
  || bad "forced-declaration probe: setup failed"
fr=$(rs slice finish P3.DECOMP --outcome cut 2>&1); fr_rc=$?; fr_done=$(grep -c '"status": "done"' "$SW/works/phases/active/P3/slices/P3.DECOMP/slice.json")
{ rs slice deps P3.S1 --depends-on none && rs slice new --phase P3 --slice P3.S2 --name s2 --depends-on none \
  && rs slice new --phase P3 --slice P3.S3 --name s3 --depends-on P3.S1; } >/dev/null 2>&1 || bad "forced-declaration probe: declaring failed"
fp=$(rs slice finish P3.DECOMP --outcome cut 2>&1); fp_rc=$?
{ rs phase new --phase P4 --name "Explain probe" --objective "explain exempt" && printf '\n## Explain\n\n- subject: P3\n' >> "$SW/works/phases/active/P4/intent.md" \
  && rs slice new --phase P4 --slice P4.S1 --name chapter; } >/dev/null 2>&1 || bad "forced-declaration probe: explain setup failed"
rs slice finish P4.DECOMP --outcome cut >/dev/null 2>&1; fe_rc=$?
[ "$fr_rc" -eq 0 ] && [ "$fr_done" -eq 1 ] && [ "$(printf '%s\n' "$fr" | grep -c '^advice: ')" -eq 1 ] \
  && printf '%s\n' "$fr" | grep -q '^advice: P3.S1 is a middle slice left undeclared, so it runs alone: .*slice deps P3.S1 --depends-on' \
  && [ "$fp_rc" -eq 0 ] && ! printf '%s\n' "$fp" | grep -q '^advice:' && printf '%s\n' "$fp" | grep -qx 'parallel_plan=P3: S1 + S2 -> S3 -> REVIEW' \
  && printf '%s\n' "$fp" | grep -q '^parallel_rounds=3 rounds for 4 open slices; 2 run beside another' && [ "$fe_rc" -eq 0 ] \
  && ok "a decomposition finishing over an undeclared middle slice prints one advice: line naming it, slice deps declares it, slice finish prints the engine's parallel plan, and an explain phase is exempt (v77)" \
  || bad "declaration advice wrong (advice rc=$fr_rc, pass rc=$fp_rc, explain rc=$fe_rc) -- $fr / $fp"

# ---------------------------------------------------------------------------
echo "== Test 10e: ids -- P<n>-/D<n>-<tail> minted with the next number beside P<n>/D<n> and v73's P-/D- tokens, one listing order, an archived id is spent, two branches mint the same number and merge clean =="
# On a copy of $F emptied of its phases, deferred jobs and git history. Explicit P<n>/D<n>, tailed and v73 token ids keep working.
newtmp MIW; cp -R "$F/.." "$MIW/ws"; MW="$MIW/ws/.sikstack"; rm -rf "$MW/.git" "$MW/works/phases/active/"* "$MW/works/phases/archived/"* "$MW/works/deferred/"*/*
mi() { ( cd "$MW" && python3 "$ENG" "$@" ); }
tail_re='([a-hjkmnp-tv-z][0-9a-hjkmnp-tv-z]|[0-9][a-hjkmnp-tv-z])'  # two Crockford symbols, a letter among them
m1=$(mi phase new --name "Minted" --objective "mint probe" 2>&1); mp=$(printf '%s\n' "$m1" | sed -n 's/^created phase \(P[^:]*\):.*/\1/p')
md=$(mi defer-job --title "minted" --reason r --trigger t --source manual 2>&1); mdid=$(printf '%s\n' "$md" | sed -n 's/^created deferred job \(D[^:]*\):.*/\1/p')
printf '%s\n' "$mp" | grep -qxE "P1-$tail_re" && [ -d "$MW/works/phases/active/$mp/slices/$mp.DECOMP" ] && [ -d "$MW/works/phases/active/$mp/slices/$mp.REVIEW" ] \
  && printf '%s\n' "$mdid" | grep -qxE "D1-$tail_re" && [ -f "$MW/works/deferred/open/$mdid/deferred.json" ] \
  && ok "phase new without --phase mints P1-<tail> on an empty workspace (two Crockford symbols, a letter among them) with its DECOMP and REVIEW; defer-job without --id mints D1-<tail>" \
  || bad "minted ids wrong -- $m1 / $md"
pm=$(mi defer-job --id D5 --title "to promote" --reason r --trigger t --source manual >/dev/null 2>&1 && mi promote-deferred D5 --create-phase --slice S1 --name "promoted" 2>&1)
pp=$(printf '%s\n' "$pm" | sed -n 's/^promoted D5 -> \(P[^.]*\)\.S1: .*/\1/p')
printf '%s\n' "$pp" | grep -qxE "P2-$tail_re" && [ -f "$MW/works/phases/active/$pp/slices/$pp.S1/slice.json" ] && [ -d "$MW/works/deferred/promoted/D5" ] \
  && ok "promote-deferred --create-phase without --phase mints the next number (P2-<tail> after P1-<tail>) and takes a bare --slice S1" || bad "promote-deferred did not mint (or refused the bare suffix) -- $pm"
mi phase archive "$pp" --force >/dev/null 2>&1; arch=$(ls "$MW/works/phases/archived")
re_tok=$(mi phase new --phase "$pp" --name again --objective again 2>&1); re_act=$(mi phase new --phase "$mp" --name again --objective again 2>&1)
nact=$(ls "$MW/works/phases/active" | wc -l | tr -d ' ')
p3=$(mi phase new --name "After archive" --objective probe 2>&1 | sed -n 's/^created phase \(P[^:]*\):.*/\1/p')
d6=$(mi defer-job --title "after promote" --reason r --trigger t --source manual 2>&1 | sed -n 's/^created deferred job \(D[^:]*\):.*/\1/p')
printf '%s\n' "$arch" | grep -qE "^[0-9]{8}_[0-9]{6}_${pp}_to_promote$" && printf '%s\n' "$re_tok" | grep -q "phase already exists (archived): $pp" \
  && printf '%s\n' "$re_act" | grep -q "phase already exists: $mp" && [ "$nact" = 1 ] \
  && printf '%s\n' "$p3" | grep -qxE "P3-$tail_re" && printf '%s\n' "$d6" | grep -qxE "D6-$tail_re" \
  && ok "a tailed phase archives as <stamp>_P2-<tail>_<slug>; phase new refuses an explicit id that exists active or archived (an archived id is spent); the next mint counts the archived P2 (P3-<tail>) and the promoted D5 (D6-<tail>)" \
  || bad "archived tailed id not spent, or the next number missed it -- $arch / $re_tok / $re_act / $nact / $p3 / $d6"
( for n in 9 10; do mi phase new --phase "P$n" --name "Numeric $n" --objective probe || exit 1; done \
  && for d in D10 D2; do mi defer-job --id "$d" --title "$d" --reason r --trigger t --source manual || exit 1; done \
  && mi phase new --phase P11-ab --name "Tailed 11" --objective probe ) >/dev/null 2>&1 || bad "mixed-id probe: setup failed"
p12=$(mi phase new --name "After P11-ab" --objective probe 2>&1 | sed -n 's/^created phase \(P[^:]*\):.*/\1/p')
printf '%s\n' "$p12" | grep -qxE "P12-$tail_re" \
  && ok "an explicit tailed id counts toward the next number (after P9, P10 and P11-ab a mint draws P12-<tail>)" || bad "the mint missed the tailed P11-ab -- $p12"
( mi phase new --phase P46-k2 --name "Tailed 46" --objective probe && mi phase new --phase P-7kq2 --name "Token" --objective probe \
  && mi defer-job --id D-m3xa --title token --reason r --trigger t --source manual ) >/dev/null 2>&1 || bad "mixed-id probe: could not add P46-k2, P-7kq2 or D-m3xa"
val_mix=$(mi check --no-rebuild 2>&1); val_rc=$?
dlist=$(sed -n '/^## Open/,/^## Promoted/p' "$MW/works/deferred.md" | sed -n 's/^| `\([^`]*\)` |.*/\1/p' | tr '\n' ' ')
[ "$dlist" = "$mdid D2 $d6 D10 D-m3xa " ] && [ "$val_rc" -eq 0 ] && printf '%s\n' "$val_mix" | grep -q '^Workflow validation passed' \
  && ok "mixed ids (D1-<tail>, D2, D10, D-m3xa) list numbered ids by number, then v73 tokens (the deferred dashboard: $dlist), and validate passes" \
  || bad "mixed ids out of order or invalid -- deferred: $dlist / $val_mix"
# Two branches of one repo each mint a phase and a deferred job unseen by the other, so both draw number 1: the
# merge conflicts in generated files only, and taking either side then `check` (payload/gitattributes) leaves
# both phases and both jobs, valid, and the shared number is refused until the tail is typed.
newtmp TBW; cp -R "$F/.." "$TBW/ws"; TW="$TBW/ws/.sikstack"; rm -rf "$TW/.git" "$TW/works/phases/active/"* "$TW/works/phases/archived/"* "$TW/works/deferred/"*/*; : > "$TW/works/events.jsonl"
tw() { ( cd "$TW" && python3 "$ENG" "$@" ); }
tg() { git -C "$TW" -c user.email=smoke@example.invalid -c user.name=smoke "$@"; }
( tw check && tg init -q && tg add -A && tg commit -q --allow-empty -m base \
  && tg checkout -q -b one && tw phase new --name "Branch one" --objective one && tw defer-job --title one --reason r --trigger t --source manual && tg add -A && tg commit -qm one \
  && tg checkout -q - && tg checkout -q -b two && tw phase new --name "Branch two" --objective two && tw defer-job --title two --reason r --trigger t --source manual ) >/dev/null 2>&1 \
  || bad "two-branch probe: setup failed"
tb_p1=$(tg show --name-only --format= one | sed -n 's|^works/phases/active/\([^/]*\)/phase.json$|\1|p'); tb_d1=$(tg show --name-only --format= one | sed -n 's|^works/deferred/open/\([^/]*\)/deferred.json$|\1|p')
# Deterministic: a same-tail draw (1 in 924 per kind) is the add/add conflict the engine documents, never a silent
# mix -- so when branch two drew branch one's tail, it redoes its side with explicit, distinct tails.
if [ -d "$TW/works/phases/active/$tb_p1" ] || [ -d "$TW/works/deferred/open/$tb_d1" ]; then
  tb_t=ab; [ "$tb_p1" = P1-ab ] && tb_t=ac; tb_u=ab; [ "$tb_d1" = D1-ab ] && tb_u=ac
  ( tg reset -q --hard && tg clean -qfd && tw phase new --phase "P1-$tb_t" --name "Branch two" --objective two \
    && tw defer-job --id "D1-$tb_u" --title two --reason r --trigger t --source manual ) >/dev/null 2>&1 || bad "two-branch probe: the same-tail redo failed"
fi
( tg add -A && tg commit -qm two ) >/dev/null 2>&1 || bad "two-branch probe: branch two did not commit"
tg merge -q --no-edit one >/dev/null 2>&1; conflicted=$(tg diff --name-only --diff-filter=U | tr '\n' ' ')
outside=$(printf '%s\n' $conflicted | grep -vxE 'works/(state\.json|index\.json|deferred\.md|agenda\.md)|backlog\.md')
( for f in $conflicted; do tg checkout --theirs -- "$f" || exit 1; done; tw check && tg add -A && tg commit -qm merge ) >/dev/null 2>&1
tb_val=$(tw check --no-rebuild 2>&1); tb_rc=$?; tb_run=$(tw gate 1 2>&1); tb_run_rc=$?
[ -z "$outside" ] && [ "$(ls "$TW/works/phases/active" | grep -cE "^P1-$tail_re$")" = 2 ] && [ "$(ls "$TW/works/deferred/open" | grep -cE "^D1-$tail_re$")" = 2 ] \
  && [ "$tb_rc" -eq 0 ] && [ -z "$(tg status --porcelain)" ] && [ "$(grep -c '"type": "phase_created"' "$TW/works/events.jsonl")" = 2 ] \
  && [ "$tb_run_rc" -ne 0 ] && printf '%s\n' "$tb_run" | grep -qE "names 2 phases numbered 1: .*P1-$tail_re.*P1-$tail_re.*type the tail" \
  && ok "two branches each mint a phase and a deferred job with the same number (P1-, D1-) and merge with conflicts only in generated files (${conflicted:-none}); either side + rebuild validates, and gate 1 then lists both" \
  || bad "two-branch mint did not merge clean -- conflicted: $conflicted / outside: $outside / $tb_val / $tb_run"

# ---------------------------------------------------------------------------
echo "== Test 10f: brief names -- 13 / P13 name the one P13-<tail>, a shared number is refused and listed, an exact P12 wins, 7kq2 / P-7kq2 still name a v73 id =="
# A copy of $F emptied of its phases: a v73 token phase beside P12 and P12-ab. Brief names go through one choke point after argparse.
newtmp BNW; cp -R "$F/.." "$BNW/ws"; BN="$BNW/ws/.sikstack"; rm -rf "$BN/.git" "$BN/works/phases/active/"* "$BN/works/phases/archived/"* "$BN/works/deferred/"*/*; bn() { ( cd "$BN" && python3 "$ENG" "$@" ); }
bn_pid=7kq2; bn_up=7KQ2
( bn phase new --phase "P-$bn_pid" --name "Brief" --objective probe && bn phase new --phase 12 --name "Numbered" --objective probe \
  && bn phase new --phase P12-ab --name "Twelve tailed" --objective probe ) >/dev/null 2>&1 || bad "brief-name probe: setup failed"
bn_gate=$(bn gate "$bn_pid" waive --note probe 2>&1); bn_show=$(bn gate "p-$bn_up" 2>&1); bn_old=$(bn gate 12 2>&1); bn_bad=$(bn gate "P$bn_pid" 2>&1); bn_bad_rc=$?
bn_did=$(bn defer-job --title brief --reason r --trigger t --source manual 2>&1 | sed -n 's/^created deferred job \(D[^:]*\):.*/\1/p'); bn_drop=$(bn drop-deferred 1 --reason x 2>&1)
printf '%s\n' "$bn_gate" | grep -qx "phase P-$bn_pid: operator acceptance WAIVED -- probe" && printf '%s\n' "$bn_show" | grep -qx "phase=P-$bn_pid" && printf '%s\n' "$bn_old" | grep -qx 'phase=P12' \
  && [ "$bn_bad_rc" -ne 0 ] && printf '%s\n' "$bn_bad" | grep -q "not a phase id" && printf '%s\n' "$bn_did" | grep -qxE "D1-$tail_re" && printf '%s\n' "$bn_drop" | grep -q "^dropped $bn_did:" \
  && ok "a phase or deferred-id argument takes the brief name (gate 7kq2, p-7KQ2, 12; drop-deferred 1 names the one D1-<tail>) and refuses P7kq2 with the shapes" || bad "brief names on commands wrong -- $bn_gate / $bn_show / $bn_old / $bn_bad / $bn_did / $bn_drop"
bn_t=$(bn phase new --name "Tailed" --objective probe 2>&1 | sed -n 's/^created phase \(P[^:]*\):.*/\1/p'); bn_tu=$(printf '%s' "${bn_t#P13-}" | tr '[:lower:]' '[:upper:]')
bn_ag=$(bn gate p13 2>&1); bn_agt=$(bn gate "p13-$bn_tu" 2>&1)
bn_sl=$(bn slice new --phase 13 --slice 13.S1 --name brief --kind implementation --risk low --depends-on none 2>&1)
bn_t2=ab; [ "$bn_t" = P13-ab ] && bn_t2=ac
bn phase new --phase "13-$bn_t2" --name "Twin" --objective probe >/dev/null 2>&1 || bad "brief-name probe: the twin P13-$bn_t2 failed"
bn_amb=$(bn gate 13 2>&1); bn_amb_rc=$?; bn_full=$(bn gate "p13-$(printf '%s' "$bn_t2" | tr '[:lower:]' '[:upper:]')" 2>&1)
printf '%s\n' "$bn_t" | grep -qxE "P13-$tail_re" && printf '%s\n' "$bn_agt" | grep -qx "phase=$bn_t" && printf '%s\n' "$bn_ag" | grep -qx "phase=$bn_t" \
  && printf '%s\n' "$bn_sl" | grep -q "^created slice $bn_t.S1: " \
  && [ "$bn_amb_rc" -ne 0 ] && printf '%s\n' "$bn_amb" | grep -q "names 2 phases numbered 13: .*type the tail" && printf '%s\n' "$bn_full" | grep -qx "phase=P13-$bn_t2" \
  && ok "a bare phase new mints the next number over P12 and P12-ab ($bn_t); p13 and p13-<TAIL> name it while it is the only P13 (gate, slice new --slice 13.S1); a second P13 makes 13 a refusal listing both, and 13-<tail> still names one" \
  || bad "the number lookup is wrong -- $bn_t / $bn_agt / $bn_ag / $bn_sl / $bn_amb / $bn_full"

# ---------------------------------------------------------------------------
echo "== Test 10i: agenda -- items, ids, transitions, order, links, the generated page, validate, two branches (the gate's exemption for an added item: Test 12) =="
# A fresh --at-root install. Items live in works/agenda/<AID>/agenda.json; works/agenda.md, index.json's
# agenda keys and the backlog's count are generated from them; an item never moves `next`.
newtmp AGW; AG="$AGW/ws"
mkws AG >/dev/null 2>&1 || bad "agenda probe: fresh install failed"
ag() { ( cd "$AG" && python3 "$ENG" "$@" ); }
ag_tree() { ( cd "$AG" && find works -type f ! -name '*.md' ! -name index.json ! -name state.json | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done ); }
ag_items() { ( cd "$AG/works/agenda" && for f in */agenda.json; do printf '%s %s\n' "$f" "$(sha "$f")"; done ); }
ag_key() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], "<absent>"))' "$AG/works/agenda/$1/agenda.json" "$2"; }
ag_order() { ag agenda --json | python3 -c 'import json,sys; print(" ".join(i["id"] for i in json.load(sys.stdin)))'; }
tail_re='([a-hjkmnp-tv-z][0-9a-hjkmnp-tv-z]|[0-9][a-hjkmnp-tv-z])'
# (a) the generated page and the index, before any item and after: stable bytes, the keys, the backlog line.
pg0=$(sha "$AG/works/agenda.md" 2>/dev/null); rm -f "$AG/works/agenda.md"; sleep 1  # a stamp would move with the clock
ag check >/dev/null 2>&1; pg1=$(sha "$AG/works/agenda.md" 2>/dev/null)
ag_idx() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(not ("agenda_counts" in d and "agenda" in d))' "$AG/works/index.json"; }
[ -n "$pg0" ] && [ "$pg0" = "$pg1" ] && ag_idx && grep -qxF -e '- Open agenda items: `0`' "$AG/backlog.md" \
  && ok "a fresh install has works/agenda.md with no item, byte-identical across rebuilds; index.json has agenda_counts and agenda; backlog.md says Open agenda items: 0" \
  || bad "the empty agenda page or index keys missing -- [$pg0] [$pg1] $(grep -F 'agenda' "$AG/backlog.md")"
# (b) ids: A1-<tail> first, its own number sequence, an explicit tailed id once, brief forms.
a1=$(ag agenda-add --title "first" 2>&1 | sed -n 's/^added \(A[^:]*\):.*/\1/p')
a2=$(ag agenda-add --title "second" 2>&1 | sed -n 's/^added \(A[^:]*\):.*/\1/p')
p1=$(ag phase new --name "Plain" --objective probe 2>&1 | sed -n 's/^created phase \(P[^:]*\):.*/\1/p')
d1=$(ag defer-job --title plain --reason r --trigger t --source manual 2>&1 | sed -n 's/^created deferred job \(D[^:]*\):.*/\1/p')
ex1=$(ag agenda-add --id A13-n1 --title "thirteen" 2>&1); ex2=$(ag agenda-add --id A13-n1 --title "again" 2>&1); ex2_rc=$?
ag agenda-edit 1 --title "first, by 1" >/dev/null 2>&1; ag agenda-edit A2 --title "second, by A2" >/dev/null 2>&1
printf '%s\n' "$a1" | grep -qxE "A1-$tail_re" && printf '%s\n' "$a2" | grep -qxE "A2-$tail_re" \
  && printf '%s\n' "$p1" | grep -qxE "P1-$tail_re" && printf '%s\n' "$d1" | grep -qxE "D1-$tail_re" \
  && [ "$ex1" = "added A13-n1: thirteen" ] && [ "$ex2_rc" -ne 0 ] && [ "$(printf '%s\n' "$ex2" | wc -l | tr -d ' ')" = 1 ] \
  && [ "$(ag_key "$a1" title)" = "first, by 1" ] && [ "$(ag_key "$a2" title)" = "second, by A2" ] \
  && ok "agenda-add mints A1-<tail> then A2-<tail> and spends no phase or deferred number (P1-, D1- next); --id A13-n1 is taken once and refused in one line after; 1 and A2 name their items" \
  || bad "agenda ids wrong -- $a1 / $a2 / $p1 / $d1 / $ex1 / $ex2"
# (c) transitions: defer, solve with an outcome, reopen, drop with a reason, reopen (both cleared);
# a refused transition is one line and non-zero; a bulk call with one bad id writes nothing.
st=""
for step in "agenda-defer $a2" "agenda-solve $a2 --outcome shipped" "agenda-reopen $a2" "agenda-drop $a2 --reason dup" "agenda-reopen $a2"; do
  ag $step >/dev/null 2>&1 || st="$st [refused: $step]"
  st="$st $(ag_key "$a2" status)/$(ag_key "$a2" outcome)/$(ag_key "$a2" reason)"
done
rf=$(ag agenda-reopen "$a1" 2>&1); rf_rc=$?
tr0=$(ag_tree); bk=$(ag agenda-defer A13 A99-zz 2>&1); bk_rc=$?; tr1=$(ag_tree)
[ "$st" = " deferred/None/None solved/shipped/None open/None/None dropped/None/dup open/None/None" ] \
  && [ "$rf_rc" -ne 0 ] && [ "$(printf '%s\n' "$rf" | wc -l | tr -d ' ')" = 1 ] \
  && [ "$bk_rc" -ne 0 ] && [ "$tr0" = "$tr1" ] && [ "$(ag_key A13-n1 status)" = open ] \
  && ok "defer, solve --outcome, reopen, drop --reason, reopen (outcome and reason cleared); reopening an Open item is refused in one line; agenda-defer A13 A99-zz changes nothing" \
  || bad "agenda transitions wrong -- $st / $rf / $bk"
uo=$(ag agenda-add --title x --bogus 2>&1); uo_rc=$?; tr2=$(ag_tree)
[ "$uo_rc" -eq 2 ] && [ "$(printf '%s\n' "$uo" | wc -l | tr -d ' ')" = 1 ] && [ "$tr1" = "$tr2" ] \
  && ok "an unknown option on an agenda command (agenda-add --bogus) is one line, exit 2, nothing written" \
  || bad "an unknown agenda option is not one line and exit 2 (rc=$uo_rc) -- $uo"
# (d) order: the newest item first, a reopened item last, a move rewrites only the moved item's file.
o1=$(ag_order); it0=$(ag_items); ag agenda-move A13 --last >/dev/null 2>&1; it1=$(ag_items)
moved=$(diff <(printf '%s\n' "$it0") <(printf '%s\n' "$it1") | sed -n 's/^> \([^/]*\)\/.*/\1/p' | tr '\n' ' ')
[ "$o1" = "A13-n1 $a1 $a2" ] && [ "$moved" = "A13-n1 " ] && [ "$(ag_order)" = "$a1 $a2 A13-n1" ] \
  && ok "a new item lists first and a reopened one last ($o1); agenda-move --last rewrites only the moved item's agenda.json" \
  || bad "agenda order wrong -- $o1 / moved: $moved / $(ag_order)"
# (e) links: phase new --agenda links and the item reads In progress; a second item cannot take that phase;
# no agenda command changes `next`; agenda-delete clears the link and the phase stays, with no agenda key.
p2=$(ag phase new --name "Linked" --objective probe --agenda 1 2>&1 | sed -n 's/^created phase \(P[^:]*\):.*/\1/p')
nx1=$(ag next 2>&1); lk=$(ag agenda-link 2 --phase "$p2" 2>&1); lk_rc=$?
shown=$(ag agenda 2>&1 | grep "^$a1 ")
ag agenda-add --title "noise" >/dev/null 2>&1; ag agenda-defer 14 >/dev/null 2>&1; ag agenda-move A13 --first >/dev/null 2>&1; nx2=$(ag next 2>&1)
dl=$(ag agenda-delete "$a1" 2>&1); dl_rc=$?; nx3=$(ag next 2>&1)
pj="$AG/works/phases/active/$p2/phase.json"
[ -n "$p2" ] && [ "$lk_rc" -ne 0 ] && printf '%s\n' "$shown" | grep -q 'In progress' \
  && [ "$nx1" = "$nx2" ] && [ "$nx2" = "$nx3" ] \
  && [ "$dl_rc" -eq 0 ] && [ -f "$pj" ] && ! grep -q '"agenda"' "$pj" && [ ! -d "$AG/works/agenda/$a1" ] \
  && ok "phase new --agenda links $p2 and $a1 reads In progress; a second item cannot take it ($lk); agenda commands leave next unchanged; agenda-delete clears the link and the phase stays with no agenda key" \
  || bad "agenda links wrong -- $p2 / $lk / $shown / $dl / next changed: $([ "$nx1" = "$nx2" ] && [ "$nx2" = "$nx3" ] && echo no || echo yes)"
grep -qxF -e '- Open agenda items: `2`' "$AG/backlog.md" && [ "$(sha "$AG/works/agenda.md")" != "$pg0" ] \
  && ok "the backlog counts Open and In progress items, never Deferred ones (2), and works/agenda.md follows the items" \
  || bad "the backlog count or the agenda page did not follow -- $(grep -F 'agenda' "$AG/backlog.md")"
# (f) validate: a `Z` stamp (JavaScript's toISOString form) passes on every Python, 3.9 and 3.10 included
# (the engine reads its own stamp form, never fromisoformat); a dangling link is a warning (validate passes);
# a corrupt agenda.json still rebuilds (check, exit 1) and fails validate, naming the folder.
z_dir=$(cd "$AG/works/agenda" && ls -d A*-* | grep -vx 'A13-n1' | head -n 1)
python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["changed_at"]="2026-11-17T10:00:00.123Z"; open(p,"w").write(json.dumps(d, indent=2)+"\n")' "$AG/works/agenda/$z_dir/agenda.json"
z_val=$(ag check --no-rebuild 2>&1); z_rc=$?
[ -n "$z_dir" ] && [ "$z_rc" -eq 0 ] && ! printf '%s\n' "$z_val" | grep -q "agenda/$z_dir" \
  && ok "an agenda item whose changed_at ends in Z (2026-11-17T10:00:00.123Z) passes validate on $(python3 -V 2>&1)" \
  || bad "a Z changed_at failed validate on $(python3 -V 2>&1) -- $z_dir / $z_rc -- $(printf '%s\n' "$z_val" | grep -i agenda)"
python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["agenda"]="A77-zz"; open(p,"w").write(json.dumps(d, indent=2)+"\n")' "$pj"
v1=$(ag check --no-rebuild 2>&1); v1_rc=$?
printf '{' > "$AG/works/agenda/A13-n1/agenda.json"
rb=$(ag check 2>&1); rb_rc=$?; v2=$(ag check --no-rebuild 2>&1); v2_rc=$?
[ "$v1_rc" -eq 0 ] && printf '%s\n' "$v1" | grep -q "^warning: .*$p2.*A77-zz" \
  && [ "$rb_rc" -eq 1 ] && printf '%s\n' "$rb" | grep -qx 'rebuilt workflow' && [ "$v2_rc" -ne 0 ] && printf '%s\n' "$v2" | grep -q 'works/agenda/A13-n1' \
  && ok "a dangling agenda link is a validate warning (exit 0); a corrupt agenda.json still rebuilds and fails check naming works/agenda/A13-n1" \
  || bad "agenda validate wrong -- $v1_rc / $rb_rc / $v2_rc -- $(printf '%s\n' "$v1" "$v2" | grep -i agenda)"
# A hand-edited field can hold any JSON value: a list-valued status leaves rebuild and next at 0 (no traceback)
# and fails validate, naming the folder and the key.
ls_dir=$(cd "$AG/works/agenda" && ls -d A*-* | grep -vx 'A13-n1' | head -n 1)
python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["status"]=[1]; open(p,"w").write(json.dumps(d, indent=2)+"\n")' "$AG/works/agenda/$ls_dir/agenda.json"
ls_rb=$(ag check 2>&1); ls_rb_rc=$?; ls_nx=$(ag next 2>&1); ls_nx_rc=$?; ls_v=$(ag check --no-rebuild 2>&1); ls_v_rc=$?
[ -n "$ls_dir" ] && [ "$ls_rb_rc" -eq 1 ] && printf '%s\n' "$ls_rb" | grep -qx 'rebuilt workflow' && [ "$ls_nx_rc" -eq 0 ] && [ "$ls_v_rc" -ne 0 ] \
  && printf '%s\n' "$ls_v" | grep -q "works/agenda/$ls_dir: status \[1\]" && ! printf '%s\n' "$ls_rb" "$ls_nx" "$ls_v" | grep -q Traceback \
  && ok "a list-valued agenda status still rebuilds, leaves next at exit 0 and fails check naming works/agenda/$ls_dir" \
  || bad "a list-valued agenda status broke a read or passed validate -- $ls_dir / $ls_rb_rc / $ls_nx_rc / $ls_v_rc -- $(printf '%s\n' "$ls_rb" "$ls_nx" "$ls_v" | grep -iE 'agenda|Traceback|Error' | tail -3)"
# The same item is refused as unusable, in one line naming its file and agenda-delete, never "reopen it first" (which
# would be refused too); nothing is written. A13-n1 goes first: every agenda command reads every item.
rm -rf "$AG/works/agenda/A13-n1"; ls_t0=$(ag_tree); ls_df=$(ag agenda-defer "$ls_dir" 2>&1); ls_df_rc=$?
[ -n "$ls_dir" ] && [ "$ls_df_rc" -eq 1 ] && [ "$(printf '%s\n' "$ls_df" | wc -l | tr -d ' ')" = 1 ] \
  && printf '%s\n' "$ls_df" | grep -qF "works/agenda/$ls_dir/agenda.json" && printf '%s\n' "$ls_df" | grep -qF "agenda-delete $ls_dir" \
  && ! printf '%s\n' "$ls_df" | grep -q reopen && [ "$(ag_tree)" = "$ls_t0" ] \
  && ok "agenda-defer of an item with a list-valued status is refused in one line naming works/agenda/$ls_dir/agenda.json and agenda-delete, not reopen; nothing written" \
  || bad "an unusable agenda status is refused without its file or way out -- rc=$ls_df_rc -- $(printf '%s\n' "$ls_df" | head -2 | cut -c1-240)"
# (g) two branches each add an item: the merge conflicts in generated files only, and either side + rebuild lists both.
newtmp AGB; AB="$AGB/ws"; mkws AB >/dev/null 2>&1 || bad "agenda probe: second install failed"
ab() { ( cd "$AB" && python3 "$ENG" "$@" ); }
abg() { git -C "$AB" -c user.email=smoke@example.invalid -c user.name=smoke "$@"; }
( abg init -q && abg add -A && abg commit -q --allow-empty -m base \
  && abg checkout -q -b one && ab agenda-add --id A1-ab --title one && abg add -A && abg commit -qm one \
  && abg checkout -q - && abg checkout -q -b two && ab agenda-add --id A1-ac --title two && abg add -A && abg commit -qm two ) >/dev/null 2>&1 \
  || bad "agenda two-branch probe: setup failed"
abg merge -q --no-edit one >/dev/null 2>&1; ab_conf=$(abg diff --name-only --diff-filter=U | tr '\n' ' ')
ab_out=$(printf '%s\n' $ab_conf | grep -vxE 'works/(state\.json|index\.json|deferred\.md|agenda\.md)|backlog\.md')
( for f in $ab_conf; do abg checkout --theirs -- "$f" || exit 1; done; ab check && abg add -A && abg commit -qm merge ) >/dev/null 2>&1
ab_val=$(ab check --no-rebuild 2>&1); ab_rc=$?
[ -n "$ab_conf" ] && [ -z "$ab_out" ] && [ "$ab_rc" -eq 0 ] && [ -z "$(abg status --porcelain)" ] \
  && [ "$(ab agenda 2>&1 | grep -cE '^A1-a[bc] ')" = 2 ] && grep -q 'A1-ab' "$AB/works/agenda.md" && grep -q 'A1-ac' "$AB/works/agenda.md" \
  && ok "two branches each add an item (A1-ab, A1-ac) and merge with conflicts only in generated files ($ab_conf); either side + rebuild lists both, valid and clean" \
  || bad "agenda two-branch merge wrong -- conflicted: $ab_conf / outside: $ab_out / $ab_val"

# ---------------------------------------------------------------------------
echo "== Test 10h: v74 a read leaves the tree clean -- next, rebuild and validate on a committed install change no tracked file; a real change still moves the stamps =="
# Before v74 every rebuild rewrote state.json's updated_at and both index.json stamps, so a plain
# `next` dirtied the tree. The sleep makes a rewritten stamp differ from the committed one.
newtmp RCW; RC="$RCW/ws"; mkws RC >/dev/null 2>&1 || bad "read-clean probe: the fresh install failed"
rcw() { ( cd "$RC" && python3 "$ENG" "$@" ); }
rc_stamp() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["updated_at"])' "$RC/works/state.json" 2>/dev/null; }
( cd "$RC" && git init -q . >/dev/null 2>&1 && git add -A >/dev/null 2>&1 \
    && git -c user.email=smoke@example.invalid -c user.name=smoke commit -q --allow-empty -m "read-clean baseline" >/dev/null 2>&1 ) \
  || bad "read-clean probe: could not make the fixture a git repo"
sleep 1
for rc_cmd in next check "check --no-rebuild"; do rcw $rc_cmd >/dev/null 2>&1; done  # shellcheck disable=SC2086
rc_dirty=$(git -C "$RC" status --porcelain 2>&1)
[ -z "$rc_dirty" ] && ok "next, check and check --no-rebuild leave a committed install's tree clean (no stamp-only write)" \
  || bad "a read dirtied the tree -- $rc_dirty"
rc_before=$(rc_stamp); sleep 1
rcw phase new --name "Read clean probe" --objective "a real change" >/dev/null 2>&1
rc_after=$(rc_stamp); rc_dirty=$(git -C "$RC" status --porcelain 2>&1)
[ -n "$rc_before" ] && [ "$rc_before" != "$rc_after" ] && printf '%s\n' "$rc_dirty" | grep -q '^ M works/state.json$' && printf '%s\n' "$rc_dirty" | grep -q '^ M works/index.json$' \
  && ok "a real change (phase new) still rewrites state.json and index.json with a new stamp" \
  || bad "a real change did not move the stamps ($rc_before -> $rc_after) -- $rc_dirty"

# ---------------------------------------------------------------------------
echo "== Test 11: v41 phase scope -- the phase's boundary is read from git, advisory everywhere =="
# $F is the workspace; its product repo is $F/.. (FH). A phase created (it records the repo's HEAD), then one product
# file committed after it: the boundary is exactly that file, and nothing of .sikstack/.
FH=$(cd "$F/.." && pwd)
( cd "$F" && python3 "$ENG" phase new --phase P3 --name "Scope probe" --objective "probe the boundary" >/dev/null 2>&1 \
    && git add -A >/dev/null 2>&1 && git commit -qm "create P3" >/dev/null 2>&1 ) \
  || bad "phase scope probe: could not create and commit P3"
p3_created=$( cd "$FH" && git rev-parse HEAD 2>/dev/null )
mkdir -p "$FH/src" && printf 'print("probe")\n' > "$FH/src/probe.py"
( cd "$FH" && git add src >/dev/null 2>&1 && git commit -qm "P3 product change" >/dev/null 2>&1 ) \
  || bad "phase scope probe: could not commit the product change"
scope_out=$( cd "$F" && python3 "$ENG" phase scope P3 2>&1 ); scope_rc=$?
[ "$scope_rc" -eq 0 ] && printf '%s\n' "$scope_out" | grep -q "^creation_commit=$p3_created" \
  && printf '%s\n' "$scope_out" | grep -q "^  A src/probe.py$" \
  && ! printf '%s\n' "$scope_out" | grep -qE "^  [AMDR] \.sikstack/" \
  && ok "phase scope names the creation commit (the repo's HEAD at phase new) and the changed product file, and excludes .sikstack/" \
  || bad "phase scope did not print the boundary (rc=$scope_rc) -- $scope_out"
( cd "$F" && python3 "$ENG" phase scope P3 --json 2>/dev/null | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["mode"] == "nested" and d["creation_commit"] == sys.argv[1] and d["commits"] == 1, d
assert {"status": "A", "path": "src/probe.py"} in d["files"], d
' "$p3_created" ) \
  && ok "phase scope --json parses and carries the same creation commit, mode and file list" \
  || bad "phase scope --json is not the same answer as the text form"
# F2: it prints the pathspec it read with, paste-ready after `--` (a guessed `.` would list works/), the same in
# --json and from the phase-less `phase scope --pathspec` that /read-code runs.
p3_spec=$(printf '%s\n' "$scope_out" | sed -n 's/^pathspec=//p')
p3_diff=$( cd "$FH" && eval "git diff --name-only $p3_created HEAD -- $p3_spec" 2>&1 )
p3_json=$( cd "$F" && python3 "$ENG" phase scope P3 --json 2>/dev/null | python3 -c 'import json, shlex, sys; print(json.load(sys.stdin)["pathspec"] == shlex.split(sys.argv[1]))' "$p3_spec" 2>&1 )
[ "$p3_spec" = ". ':(exclude).sikstack'" ] && [ "$p3_diff" = "src/probe.py" ] && [ "$p3_json" = True ] \
  && [ "$( cd "$F" && python3 "$ENG" phase scope --pathspec 2>&1 )" = "pathspec=$p3_spec" ] \
  && ok "phase scope prints pathspec=, which pasted after -- lists only the product file; --json and phase scope --pathspec carry the same value" \
  || bad "phase scope pathspec= missing or wrong (spec=$p3_spec json=$p3_json) -- $p3_diff"
nogit_py=$( command -v python3 )
nogit_scope=$( cd "$F" && PATH="/var/empty" "$nogit_py" "$ENG" phase scope P3 2>&1 ); nogit_rc=$?
[ "$nogit_rc" -eq 0 ] && printf '%s\n' "$nogit_scope" | grep -q "^phase scope: no git history readable in the host " \
  && ok "phase scope without git is advisory: the no-history line and exit 0" \
  || bad "phase scope failed or was silent without git (rc=$nogit_rc) -- $nogit_scope"

# ---------------------------------------------------------------------------
echo "== Test 13: schema-2 design record -- design-open makes a job and refuses a second open round of it, one connected job per slice (P46-nb: --new-job refused while the slice has an open round, the merge after the close, a legacy multi-job slice still passes and takes --job, --critique, the 10-Page size warning, mounted boards not counted), the board lint (leaves-canvas, same-target-list, unlinked-page), design-check names a missing board, a missing support line, a .. reference and a title gap, design-canvas / design-system / design-publish-plan (system copies on a first publish or a changed pin only), design-preview skips honestly without a browser, v61 design-preview machine checks on fixture boards (non-text-contrast, reflow and overprint, keyboard, the state bar, --strict, the .preview render and contact sheets; skipped with no browser), design-close snapshots and signs, a superseded round's slice reuses its job, v61 design-readback / design-sign / a generated SIGNOFF.md / the absolute-path lint and wave briefs, design-migrate --to 2; claude-design/ is skipped, the pre-v47 design-migrate, design-register is gone =="
# Runs in the fresh workspace $F.
newtmp DZ
DR="$F/docs/reference/design"
JD="$DR/jobs/01-signin"
CP="$JD/canvas/project"
dw() { ( cd "$F" && python3 "$ENG" "$@" ); }
tree_sig() { ( cd "${1:-$DR}" && find . -type f | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done ); }
# 1. The slice's first round creates its job; at most one open round per job (P36.S5C: per job, not per project).
dw design-init --id smoke-design --name "Smoke design" >/dev/null 2>&1 || bad "design probe: design-init failed"
open_out=$(dw design-open --slug signin --slice P9.S1 2>&1); open_rc=$?
out=$(dw design-open --slug other --slice P9.S1 2>&1); rc=$?
if [ "$open_rc" -eq 0 ] && [ -f "$JD/job.json" ] && [ -f "$JD/rounds/01-signin/round.json" ] \
    && [ "$rc" -ne 0 ] && printf '%s\n' "$out" | grep -Fq 'refused -- 01-signin/01-signin is open' \
    && [ ! -e "$JD/rounds/02-other" ] && [ ! -e "$DR/jobs/02-other" ]; then
  ok "design-open creates job 01-signin with round 01-signin, and a second round of the same job while one is open refuses and creates nothing"
else bad "design-open did not create the job and round, or a second round of the open job was not refused (rc=$open_rc/$rc) -- $open_out $out"; fi
# 2. A minimal valid canvas tree passes; one broken variant names each kind of break.
python3 - "$JD" <<'CANVAS' || bad "design probe: could not write the canvas tree"
import json, pathlib, sys
job = pathlib.Path(sys.argv[1])
project = job / "canvas/project"
(job / "rounds/01-signin/handoff.md").write_text("# handoff\n")
project.mkdir(parents=True, exist_ok=True)
boards = {"Main.dc.html": {"x": 0, "y": 0, "w": 880, "h": 560, "title": "01 · Sign-in"},
          "Error.dc.html": {"x": 960, "y": 0, "w": 880, "h": 560, "title": "02 · Error"}}
index = {"v": 3, "createdOnFiles": {"v": 1, "at": "2026-10-14T00:00:00Z"}, "title": "Sign-in", "launch": {"view": "canvas"},
         "pages": [], "boards": boards, "order": list(boards), "notes": {}, "designSystems": []}
(project / "canvas.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
for name, board in boards.items():
    (project / name).write_text(
        '<!doctype html>\n<html><head>\n<script src="./support.js"></script>\n'
        '<link rel="stylesheet" href="ds/smoke/tokens.css">\n</head>\n'
        # the allowed references besides a relative path inside project/: #, data:, https, /_blob/, a {{hole}}
        '<body><x-dc><a href="#top"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""></a>'
        '<a href="https://example.com/">more</a><img src="/_blob/abc123" alt=""><img src="{{logo}}" alt="">'
        f'<p>{board["title"]}</p></x-dc></body></html>\n', encoding="utf-8")
CANVAS
mkdir -p "$DZ/good" && cp -R "$CP/." "$DZ/good/"
python3 - "$CP" <<'BREAK' || bad "design probe: could not break the canvas tree"
import json, pathlib, sys
project = pathlib.Path(sys.argv[1])
index = json.loads((project / "canvas.json").read_text(encoding="utf-8"))
index["boards"]["Gone.dc.html"] = {"x": 0, "y": 680, "w": 400, "h": 300, "title": "04 · Gone"}  # no file, and no 03
index["order"].append("Gone.dc.html")
(project / "canvas.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
main = (project / "Main.dc.html").read_text(encoding="utf-8")
main = main.replace('<script src="./support.js"></script>\n', "").replace('href="ds/smoke/tokens.css"', 'href="../escape.css"')
(project / "Main.dc.html").write_text(main, encoding="utf-8")
BREAK
out=$(dw design-check 01-signin 2>&1); rc=$?
cp -R "$DZ/good/." "$CP/"
ok_out=$(dw design-check 2>&1); ok_rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$out" | grep -Fq "board 'Gone.dc.html' is listed but its file is missing" \
    && printf '%s\n' "$out" | grep -Fq 'Main.dc.html: missing the exact line <script src="./support.js"></script>' \
    && printf '%s\n' "$out" | grep -Fq "Main.dc.html: references '../escape.css' (" \
    && printf '%s\n' "$out" | grep -Fq 'no board titled "03 · …"' && [ "$ok_rc" -eq 0 ]; then
  ok "design-check names a missing listed board, a missing support line, a .. reference and a title gap (exit 1), and passes the valid tree with #, data:, https, /_blob/ and {{hole}} references"
else bad "design-check missed a break in the canvas tree, or failed the valid tree (rc=$rc, valid rc=$ok_rc) -- $out $ok_out"; fi
# 3. The canvas record and the publish plan: null for a removed board; v60 (P36.S9): the system install
# copies only on a first publish or a changed system pin (canvas.system), never on a plain republish.
url_out=$(dw design-canvas 01-signin --url https://example.com/artifact/abc 2>&1); url_rc=$?
dw design-canvas 01-signin --url https://claude.ai/artifact/SmokeCanvas1 >/dev/null 2>&1 \
  || bad "design probe: design-canvas --url failed"
dw design-system --artifact https://claude.ai/artifact/SmokeSystem1 --namespace smoke --version 5-sys \
  --files tokens.json,tokens.css >/dev/null 2>&1 || bad "design probe: design-system failed"
pin() { python3 - "$CP/canvas.json" "$1" <<'PIN'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
index = json.loads(path.read_text(encoding="utf-8"))
index["designSystems"] = [{"title": "Smoke", "namespace": "smoke", "artifact": "https://claude.ai/artifact/SmokeSystem1",
                           "version": sys.argv[2], "copiedAt": "2026-10-18T00:00:00Z"}]
path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
PIN
}
# plan_is <expect-system-copies: 1|0> <expect Error.dc.html: live|null>
plan_is() { dw design-publish-plan 01-signin 2>&1 | python3 -c '
import json, sys
plan = json.load(sys.stdin)
system = "https://claude.ai/artifact/SmokeSystem1"
assert plan["url"] == "https://claude.ai/artifact/SmokeCanvas1", plan
assert plan["root"].endswith("/jobs/01-signin/canvas") and plan["file_path"].endswith("/jobs/01-signin/canvas/project/canvas.json"), plan
want = {"project/Main.dc.html": "project/Main.dc.html",
        "project/Error.dc.html": "project/Error.dc.html" if sys.argv[2] == "live" else None}
if sys.argv[1] == "1":
    want.update({"project/ds/smoke/tokens.json": {"artifact": system, "path": "project/tokens.json"},
                 "project/ds/smoke/tokens.css": {"artifact": system, "path": "project/tokens.css"}})
assert plan["files"] == want, plan["files"]
' "$1" "$2" >/dev/null 2>&1; }
pin 5-sys || bad "design probe: could not pin the system in canvas.json"
plan_is 1 live && first_ok=1 || first_ok=0
dw design-canvas 01-signin --version 1700000000-aaaa >/dev/null 2>&1 || bad "design probe: design-canvas --version failed"
published=$(python3 -c 'import json, sys; c = json.load(open(sys.argv[1]))["canvas"]; print(" ".join(c["published"]), c["system"])' "$JD/job.json")
[ "$url_rc" -ne 0 ] && printf '%s\n' "$url_out" | grep -Fq 'is not an Artifact address' \
  && [ "$published" = "project/Error.dc.html project/Main.dc.html project/canvas.json 5-sys" ] \
  && ok "design-canvas rejects a non-claude host, and --version records the published file list and the installed system pin (canvas.system)" \
  || bad "design-canvas accepted a foreign host or recorded the wrong published list or system pin (rc=$url_rc) -- $url_out / $published"
mv "$CP/Error.dc.html" "$DZ/Error.dc.html"
python3 - "$CP/canvas.json" <<'DROP' || bad "design probe: could not drop the board from canvas.json"
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
index = json.loads(path.read_text(encoding="utf-8"))
del index["boards"]["Error.dc.html"]
index["order"].remove("Error.dc.html")
path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
DROP
plan_is 0 null && again_ok=1 || again_ok=0
dw design-system --artifact https://claude.ai/artifact/SmokeSystem1 --namespace smoke --version 6-sys \
  --files tokens.json,tokens.css >/dev/null 2>&1 && pin 6-sys || bad "design probe: could not move the system to 6-sys"
plan_is 1 null && moved_ok=1 || moved_ok=0
python3 - "$JD/job.json" <<'PRE60' || bad "design probe: could not write a pre-v60 job.json"
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
job = json.loads(path.read_text(encoding="utf-8"))
del job["canvas"]["system"]
path.write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PRE60
pre60_chk=$(dw design-check 01-signin 2>&1); pre60_rc=$?
plan_is 0 null && pre60_ok=1 || pre60_ok=0
if [ "$first_ok$again_ok$moved_ok$pre60_ok" = "1111" ] && [ "$pre60_rc" -eq 0 ]; then
  ok "design-publish-plan maps each project file to itself and a board removed since the last publish to null; the system install copies ride a first publish, are left out of a republish, come back when canvas.json's pin moves, and a pre-v60 job.json without canvas.system is valid and leaves them out"
else bad "design-publish-plan sent or dropped the system copies at the wrong time (first=$first_ok republish=$again_ok moved=$moved_ok pre-v60=$pre60_ok check rc=$pre60_rc) -- $(dw design-publish-plan 01-signin 2>&1) $pre60_chk"; fi
# P36.S4: design-preview with no browser is an honest skip -- it says so, exits 0 and writes nothing.
printf '/* a stand-in runtime path; never run */\n' > "$DZ/dc-runtime.js"
before=$(tree_sig)
out=$( export AGENTIC_DESIGN_BROWSER=/nonexistent; dw design-preview 01-signin --runtime "$DZ/dc-runtime.js" 2>&1 ); rc=$?
[ "$rc" -eq 0 ] && printf '%s\n' "$out" | grep -qx 'preview=skipped reason=no-browser' && ! printf '%s\n' "$out" | grep -q '^board=' \
  && [ "$(tree_sig)" = "$before" ] \
  && ok "design-preview with no browser prints preview=skipped reason=no-browser, exits 0 and leaves the design root byte-identical" \
  || bad "design-preview did not skip honestly without a browser (rc=$rc) -- $out"
# P36.S5A: --click skips the same way: no state or link line, no --out folder, no preview.json.
out=$( export AGENTIC_DESIGN_BROWSER=/nonexistent; dw design-preview 01-signin --runtime "$DZ/dc-runtime.js" --click --out "$DZ/pv" 2>&1 ); rc=$?
[ "$rc" -eq 0 ] && printf '%s\n' "$out" | grep -qx 'preview=skipped reason=no-browser' && ! printf '%s\n' "$out" | grep -Eq '^(board=|state |link )' \
  && [ ! -e "$DZ/pv" ] && [ "$(tree_sig)" = "$before" ] \
  && ok "design-preview --click with no browser prints preview=skipped reason=no-browser, exits 0 and writes nothing" \
  || bad "design-preview --click did not skip honestly without a browser (rc=$rc) -- $out"
# v61 (P37.S6): the machine checks on tiny fixture boards, in a copy of this workspace (a job of its own).
# Each fixture shows one finding: a 1.5:1 button border (non-text-contrast) beside a 3.5:1 one (none);
# two labels that cross only at 200% text (overprint, text200 only); a row wider than 320px (reflow,
# w320 only); a <span> with a click listener and no tabindex that opens a dialog (keyboard); a sticky
# state bar (state-bar, rendered and static). --strict exits 1 naming the blocking checks, the render
# stays in .preview/<job>/<round>/, and --contact-sheet writes one sheet per board. With no browser on
# this machine the block says so and asserts nothing (the honest skip above still runs everywhere).
newtmp MC; cp -R "$F/../." "$MC/"; MC="$MC/.sikstack"
mc() { ( cd "$MC" && python3 "$ENG" "$@" ); }
MJ=$(mc design-open --slug fixture --slice P9.S6 2>&1 | sed -n 's#^design-open: created job .*/jobs/\([^/]*\)/ .*#\1#p')
[ -n "$MJ" ] || bad "machine-check probe: design-open failed"
python3 - "$MC/docs/reference/design/jobs/$MJ/canvas/project" <<'FIXTURE' || bad "machine-check probe: could not write the fixture boards"
import json, pathlib, sys
project = pathlib.Path(sys.argv[1])
project.mkdir(parents=True, exist_ok=True)
boards = {"Main.dc.html": {"x": 0, "y": 0, "w": 800, "h": 600, "title": "01 · Page — Fixture", "expand": "fill", "is_interactive": True},
          "Borders.dc.html": {"x": 0, "y": 700, "w": 400, "h": 200, "title": "02 · Component — Borders"}}
index = {"v": 3, "createdOnFiles": {"v": 1, "at": "2026-10-20T00:00:00Z"}, "title": "Fixture", "launch": {"view": "canvas"},
         "pages": [], "boards": boards, "order": list(boards), "notes": {}, "designSystems": []}
(project / "canvas.json").write_text(json.dumps(index), encoding="utf-8")
head = '<!doctype html>\n<html><head>\n<script src="./support.js"></script>\n</head>\n'
(project / "Main.dc.html").write_text(head + '''<body style="margin:0;background:#fff;color:#111;font:16px/1.4 Arial,sans-serif"><x-dc>
<div data-proto="state-bar" style="position:sticky;top:0;background:#eee"><div role="group" aria-label="Fixture"><button type="button" aria-pressed="true" style="min-height:44px">Only</button></div></div>
<h1>Fixture</h1>
<div style="position:relative;height:60px"><span style="position:absolute;left:0;top:0">Alpha label</span><span style="position:absolute;left:130px;top:0">Beta</span></div>
<div style="min-width:360px;background:#ddd">A row 360px wide</div>
<p><span id="pop" style="cursor:pointer">Open the note</span></p>
<button type="button" style="width:120px;height:48px;background:#fff;border:1px solid #888;color:#111">Go</button>
</x-dc>
<script>document.getElementById('pop').addEventListener('click', () => { const d = document.createElement('div');
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Note'); d.textContent = 'The note'; document.body.appendChild(d); });</script>
</body></html>
''', encoding="utf-8")
(project / "Borders.dc.html").write_text(head + '''<body style="margin:0;background:#fff;color:#111;font:16px Arial,sans-serif"><x-dc>
<button type="button" style="width:120px;height:48px;background:#fff;border:1px solid #d0d0d0;color:#111">Weak</button>
<button type="button" style="width:120px;height:48px;background:#fff;border:1px solid #8a8a8a;color:#111">Strong</button>
</x-dc></body></html>
''', encoding="utf-8")
FIXTURE
printf '/* a stand-in runtime: the fixture boards need none */\n' > "$MC/stub-runtime.js"
mc_out=$(mc design-preview $MJ --runtime stub-runtime.js --strict --contact-sheet 2>&1); mc_rc=$?
if printf '%s\n' "$mc_out" | grep -qx 'preview=skipped reason=no-browser'; then
  printf 'SKIP: %s\n' "design-preview machine checks on fixture boards: no Chrome/Chromium on this machine (nothing asserted)"
else
  MCO="$MC/docs/reference/design/.preview/$MJ/01-fixture"
  mc_lint=$(mc design-check $MJ 2>&1)
  has() { printf '%s\n' "$mc_out" | grep -Eq "$1"; }
  [ "$mc_rc" -eq 1 ] && has '^self_check=fail blocking=non-text-contrast:1,reflow:1,overprint:1,keyboard:1$' \
    && ok "design-preview --strict exits 1 and self_check=fail names the blocking checks (non-text-contrast, reflow, overprint, keyboard)" \
    || bad "design-preview --strict did not fail the self-check as expected (rc=$mc_rc) -- $(printf '%s\n' "$mc_out" | grep -E '^(issue|self_check)')"
  has 'board=Borders\.dc\.html view=frame check=non-text-contrast: button "Weak": the control.s boundary is 1\.[45][0-9]:1' \
    && ! has 'check=non-text-contrast: button "Strong"' \
    && ok "non-text-contrast names a 1.5:1 button border and passes a 3.5:1 one" \
    || bad "non-text-contrast missed the 1.5:1 border or flagged the 3.5:1 one -- $(printf '%s\n' "$mc_out" | grep 'non-text')"
  has 'view=text200 check=overprint: span "Alpha label" and span "Beta" overprint' && ! has 'view=w320 check=overprint' \
    && has 'view=w320 check=reflow: content is 36[0-9]px wide at 320px wide' && ! has 'view=text200 check=reflow' \
    && ok "overprint names two labels that cross only at 200% text, and reflow a row wider than 320px only at 320px" \
    || bad "overprint or reflow missed its fixture or fired in the wrong view -- $(printf '%s\n' "$mc_out" | grep -E 'overprint|reflow')"
  has 'check=keyboard: span#pop "Open the note" opens dialog .*on click \(a click handler\) but never keyboard focus' \
    && ok "keyboard names a <span> with a click listener and no tabindex, and the dialog it opens" \
    || bad "keyboard missed the click-only span -- $(printf '%s\n' "$mc_out" | grep -E 'keyboard')"
  has 'board=Main\.dc\.html view=frame check=state-bar: the state bar is position: sticky' \
    && printf '%s\n' "$mc_lint" | grep -q "Main.dc.html: the state bar's own style is position: sticky (check=state-bar)" \
    && ok "a sticky state bar is a rendered state-bar issue and a design-check lint" \
    || bad "the sticky state bar was not flagged by both halves -- $(printf '%s\n' "$mc_out" | grep state-bar) / $mc_lint"
  sheets=$(ls "$MCO" 2>/dev/null | grep -c '\.sheet\.png$')
  [ "$sheets" -eq 2 ] && [ -f "$MCO/preview.json" ] && [ "$(cat "$MC/docs/reference/design/.preview/.gitignore" 2>/dev/null)" = "*" ] \
    && python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["self_check"]["result"]=="fail" and len(d["sheets"])==2 and d["out"].endswith(".preview/"+sys.argv[2]+"/01-fixture")' "$MCO/preview.json" "$MJ" \
    && ok "the render stays in the git-ignored .preview/<job>/<round>/ with preview.json naming it, and --contact-sheet writes one sheet per board" \
    || bad "the default render folder, its preview.json or the contact sheets are wrong (sheets=$sheets) -- $(ls -a "$MCO" "$MC/docs/reference/design/.preview" 2>&1)"
fi
# 4. design-close snapshots the tree byte for byte and signs the job; a superseded round's slice reuses it.
# v61 (P37.S5): signing needs a settled read-back of the round's publish and the round's build contract
# (result.md ## Build); a hand-written SIGNOFF.md (legacy) is kept, with a warning.
printf 'Published files of x (version 1700000000-aaaa), 2 files:\n- "project/Main.dc.html"  text/html  1 bytes\n' \
  | dw design-readback 01-signin --listing - >/dev/null 2>&1 || bad "design probe: design-readback --listing failed"
printf -- '- verdict: done\n\n## Summary\n\nSign-in.\n\n## Build\n\nBuild the boards.\n' > "$JD/rounds/01-signin/result.md"
pre=$(tree_sig "$CP")
printf 'Signed: "ship it"\n' > "$JD/rounds/01-signin/SIGNOFF.md"
close_out=$(dw design-close 01-signin/01-signin --words "ship it" 2>&1) || bad "design probe: design-close --words failed -- $close_out"
printf '%s\n' "$close_out" | grep -Fq 'kept the hand-written' && grep -qx 'Signed: "ship it"' "$JD/rounds/01-signin/SIGNOFF.md" \
  && ok "design-close keeps a hand-written (legacy) SIGNOFF.md, with a warning" \
  || bad "design-close overwrote a hand-written SIGNOFF.md or did not warn -- $close_out"
if [ "$(tree_sig "$JD/rounds/01-signin/canvas/project")" = "$pre" ] && python3 - "$JD" <<'SIGNED'
import json, pathlib, sys
job = pathlib.Path(sys.argv[1])
rnd = json.loads((job / "rounds/01-signin/round.json").read_text())
assert rnd["status"] == "signed" and rnd["signoff_words"] == "ship it" and rnd["canvas_version"] == "1700000000-aaaa", rnd
assert json.loads((job / "job.json").read_text())["status"] == "signed"
SIGNED
then ok "design-close --words snapshots the canvas tree byte-identical, records canvas_version and signs the job"
else bad "design-close lost the snapshot, the canvas_version or the job's signed status"; fi
before=$(tree_sig); again=$(dw design-close 01-signin --words "ship it" 2>&1); rc=$?
[ "$rc" -eq 0 ] && printf '%s\n' "$again" | grep -q 'already signed' && [ "$(tree_sig)" = "$before" ] \
  && ok "design-close is idempotent: a second run writes nothing" || bad "a second design-close was not a no-op (rc=$rc) -- $again"
{ dw design-open --slug revise --slice P9.S1 && printf '# handoff\n' > "$JD/rounds/02-revise/handoff.md" \
    && dw design-close 01-signin/02-revise --superseded && dw design-open --slug third --slice P9.S1 \
    && printf '# handoff\n' > "$JD/rounds/03-third/handoff.md"; } >/dev/null 2>&1 || bad "design probe: the superseding rounds failed"
[ "$(ls "$DR/jobs")" = "01-signin" ] && [ "$(ls "$JD/rounds" | tr '\n' ' ')" = "01-signin 02-revise 03-third " ] \
  && python3 -c 'import json, sys; assert json.load(open(sys.argv[1]))["supersedes"] == ["02-revise"]' "$JD/rounds/03-third/round.json" \
  && ok "a superseded round's slice reuses its job: rounds 02 and 03 open in job 01-signin, each superseding the last" \
  || bad "design-open after --superseded did not reuse the slice's job -- $(ls -R "$DR/jobs")"
# P36.S1: design-register and its registry / design-deck hint are retired -- the command is unknown.
out=$(dw design-register 2>&1); rc=$?
[ "$rc" -ne 0 ] && printf '%s\n' "$out" | grep -q 'invalid choice' \
  && ok "design-register is gone: the engine rejects it as an unknown command (exit $rc)" \
  || bad "design-register still answers (rc=$rc) -- $out"
# v48 (P27.S1): the claude-design tool's records live in claude-design/, which the scan never reads.
mkdir -p "$DR/claude-design/grounding/previews" "$DR/claude-design/rounds/01-old"
printf '<p>preview</p>\n' > "$DR/claude-design/grounding/previews/x.html"
printf '# old handoff\n' > "$DR/claude-design/rounds/01-old/handoff.md"
out=$(dw design-check 2>&1); rc=$?
[ "$rc" -eq 0 ] && ! printf '%s\n' "$out" | grep -q 'claude-design' \
  && ok "design-check skips claude-design/: neither its grounding HTML nor its legacy rounds are problems" \
  || bad "design-check read claude-design/ (rc=$rc) -- $out"
# With design.json present, design-migrate moves only the old record's parts and lists the rest.
mkdir -p "$DR/rounds/02-legacy" && printf '# legacy\n' > "$DR/rounds/02-legacy/handoff.md"
printf 'Signed: "old"\n' > "$DR/SIGNOFF.md" && printf 'notes\n' > "$DR/notes.txt"
out=$(dw design-migrate --apply 2>&1); rc=$?
[ "$rc" -eq 0 ] && [ -f "$DR/claude-design/rounds/02-legacy/handoff.md" ] && [ -f "$DR/claude-design/SIGNOFF.md" ] \
  && [ ! -e "$DR/rounds" ] && [ ! -e "$DR/SIGNOFF.md" ] && [ -f "$JD/rounds/01-signin/round.json" ] && [ -f "$DR/notes.txt" ] \
  && printf '%s\n' "$out" | grep -Fq 'left in place .sikstack/docs/reference/design/notes.txt' && dw design-check >/dev/null 2>&1 \
  && ok "design-migrate beside design.json moves only a round without round.json and the root SIGNOFF.md, lists other files as left in place, and design-check passes after" \
  || bad "design-migrate beside design.json moved the wrong entries (rc=$rc) -- $out"
# A pre-v47 root (no design.json): every top-level entry moves, a dry run first, all-or-nothing.
MG="$DZ/legacy/.sikstack"; MD="$MG/docs/reference/design"
mkhost "${MG%/.sikstack}" && mkdir -p "$MG/works" "$MD/rounds/01-a" "$MD/grounding"
printf '# handoff\n' > "$MD/rounds/01-a/handoff.md"; printf 'Signed: "go"\n' > "$MD/SIGNOFF.md"
printf '<p>g</p>\n' > "$MD/grounding/g.html"; printf '# the old record\n' > "$MD/README.md"
mw() { ( cd "$MG" && HOME="$DZ/home" python3 "$ENG" "$@" ); }
mig_sig() { ( cd "$MD" && find . -type f | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done ); }
# P27.F2: a pre-v47 root is steered to design-migrate -- design-init refuses and writes nothing (so the old
# tokens.css cannot silently become schema 1's), and design-check names design-migrate ahead of design-init.
legacy_before=$(mig_sig); init_out=$(mw design-init 2>&1); init_rc=$?; chk_out=$(mw design-check 2>&1); chk_rc=$?
if [ "$init_rc" -ne 0 ] && printf '%s\n' "$init_out" | grep -Fq 'design-migrate' && [ ! -e "$MD/design.json" ] \
    && [ "$chk_rc" -ne 0 ] && printf '%s\n' "$chk_out" | grep -Fq 'design.json missing; pre-v47 record: run sikstack design-migrate' \
    && [ "$(mig_sig)" = "$legacy_before" ]; then
  ok "a pre-v47 design root is steered to design-migrate: design-init refuses without writing, and design-check names design-migrate ahead of design-init"
else bad "a pre-v47 root was not steered to design-migrate (init rc=$init_rc, check rc=$chk_rc) -- $init_out $chk_out"; fi
out=$(mw design-migrate 2>&1); rc=$?
if [ "$rc" -eq 0 ] && [ "$(mig_sig)" = "$legacy_before" ] && printf '%s\n' "$out" | grep -q 'dry run -- nothing moved' \
    && ( for e in README.md SIGNOFF.md grounding rounds; do printf '%s\n' "$out" \
           | grep -Fqx "design-migrate: would move .sikstack/docs/reference/design/$e -> .sikstack/docs/reference/design/claude-design/$e" || exit 1; done ); then
  ok "design-migrate is a dry run by default: it names every top-level entry of a design.json-less root and moves nothing"
else bad "design-migrate's dry run moved something or missed an entry (rc=$rc) -- $out"; fi
out=$(mw design-migrate --apply 2>&1); rc=$?; again=$(mw design-migrate --apply 2>&1); again_rc=$?
if [ "$rc" -eq 0 ] && [ "$(ls -A "$MD")" = "claude-design" ] \
    && [ "$(mig_sig)" = "$(printf '%s\n' "$legacy_before" | sed 's#^\./#./claude-design/#')" ] \
    && [ "$again_rc" -eq 0 ] && printf '%s\n' "$again" | grep -q 'nothing to migrate'; then
  ok "design-migrate --apply moves all four entries under claude-design/ byte-identical, and a second --apply has nothing to migrate"
else bad "design-migrate --apply lost, changed or left an entry, or was not idempotent (rc=$rc/$again_rc) -- $out $again"; fi
printf 'Signed again\n' > "$MD/SIGNOFF.md"; printf '# brief\n' > "$MD/BRIEF.md"
mkdir -p "$MD/rounds/02-b" && printf '{}\n' > "$MD/rounds/02-b/round.json"
conflict_before=$(mig_sig); out=$(mw design-migrate --apply 2>&1); rc=$?
[ "$rc" -ne 0 ] && [ "$(mig_sig)" = "$conflict_before" ] && printf '%s\n' "$out" | grep -Fq 'claude-design/SIGNOFF.md already exists' \
  && printf '%s\n' "$out" | grep -Fq 'schema-1 round(s) 02-b' \
  && ok "design-migrate refuses an existing destination and a round.json in a design.json-less root, naming both, and moves nothing (not even the free BRIEF.md)" \
  || bad "design-migrate moved something past a conflict, or did not name every conflict (rc=$rc) -- $out"
# 5. P36.S3: a schema-1 (v47 card) record is legacy -- design-open refuses it with the migrate hint, and
# design-migrate --to 2 moves cards/, tokens.css and rounds/ into schema1/ byte-identical (a dry run first).
S1="$DZ/schema1/.sikstack"; SD="$S1/docs/reference/design"
mkhost "${S1%/.sikstack}" && mkdir -p "$S1/works" "$SD/cards" "$SD/rounds/01-a/cards"
printf '{"schema": 1, "id": "old-cards", "name": "Old cards"}\n' > "$SD/design.json"
printf '<!-- @dsCard group="Components" viewport="480x200" -->\n<p>a</p>\n' > "$SD/cards/01-a.html"
cp "$SD/cards/01-a.html" "$SD/rounds/01-a/cards/01-a.html" && printf ':root { --ink: #111; }\n' > "$SD/tokens.css"
printf '{"schema": 1, "round": "01-a", "status": "signed"}\n' > "$SD/rounds/01-a/round.json"
sw() { ( cd "$S1" && HOME="$DZ/home" python3 "$ENG" "$@" ); }
s1_before=$(tree_sig "$SD")
open_out=$(sw design-open --slug b --slice P9.S1 2>&1); open_rc=$?
dry=$(sw design-migrate --to 2 2>&1); dry_rc=$?
if [ "$open_rc" -ne 0 ] && printf '%s\n' "$open_out" | grep -Fq 'is schema 1; schema-1 record (numbered cards): run sikstack design-migrate --to 2' \
    && [ "$dry_rc" -eq 0 ] && printf '%s\n' "$dry" | grep -q 'dry run -- nothing moved' && [ "$(tree_sig "$SD")" = "$s1_before" ]; then
  ok "an unmigrated schema-1 root makes design-open refuse with the design-migrate --to 2 hint, and the dry run moves nothing"
else bad "a schema-1 root was not refused with the hint, or the dry run moved something (open rc=$open_rc, dry rc=$dry_rc) -- $open_out $dry"; fi
out=$(sw design-migrate --to 2 --apply 2>&1); rc=$?
if [ "$rc" -eq 0 ] && [ "$(ls -A "$SD" | tr '\n' ' ')" = "design.json schema1 " ] \
    && [ "$(tree_sig "$SD/schema1")" = "$(printf '%s\n' "$s1_before" | grep -v '^\./design\.json ')" ] \
    && python3 -c 'import json, sys; d = json.load(open(sys.argv[1])); assert d["schema"] == 2 and d["id"] == "old-cards" and d["name"] == "Old cards" and d["system"]["artifact"] is None, d' "$SD/design.json" \
    && sw design-check >/dev/null 2>&1; then
  ok "design-migrate --to 2 --apply moves cards/, tokens.css and rounds/ under schema1/ byte-identical, rewrites design.json to schema 2, and design-check passes after"
else bad "design-migrate --to 2 lost, changed or left an entry, or did not rewrite design.json (rc=$rc) -- $out"; fi

# 6. P46-nb.S1: one connected group per co-work slice, one job. --new-job refuses while another job of the
# slice has an open round and writes nothing; once the slice's other rounds are closed it creates the job
# (a merge into one connected job); a legacy multi-job slice (a wave drawn before the rule) still passes and
# takes --job; a critique level per round. The size warning sits at 10 Pages / 30 boards.
WV="$DZ/wave/.sikstack"; WR="$WV/docs/reference/design"
mkhost "${WV%/.sikstack}" && mkdir -p "$WV/works"
ww() { ( cd "$WV" && HOME="$DZ/home" python3 "$ENG" "$@" ); }
# legacy_job <design root> <src job> <src round> <new job> <new round>: a second job of the same slice,
# hand-written beside the first with its round open, the way a pre-P46-nb wave left it.
legacy_job() { python3 - "$@" <<'LEGACY'
import json, pathlib, sys
root, sjob, srnd, njob, nrnd = pathlib.Path(sys.argv[1]), *sys.argv[2:]
job = json.loads((root / "jobs" / sjob / "job.json").read_text())
rnd = json.loads((root / "jobs" / sjob / "rounds" / srnd / "round.json").read_text())
(root / "jobs" / njob / "rounds" / nrnd).mkdir(parents=True)
(root / "jobs" / njob / "job.json").write_text(json.dumps(dict(job, job=njob, title=njob.split("-", 1)[1])))
(root / "jobs" / njob / "rounds" / nrnd / "round.json").write_text(json.dumps(dict(rnd, round=nrnd, title=nrnd.split("-", 1)[1])))
LEGACY
}
ww design-init --id wave >/dev/null 2>&1 || bad "wave probe: design-init failed"
a_out=$(ww design-open --slug checkout --slice P9.S4 --critique critic 2>&1); a_rc=$?
b_out=$(ww design-open --slug settings --slice P9.S4 --new-job 2>&1); b_rc=$?
bad_out=$(ww design-open --slug loud --slice P9.S4 --new-job --critique judge 2>&1); bad_rc=$?
printf '# handoff\n\ncritique: critic\n' > "$WR/jobs/01-checkout/rounds/01-checkout/handoff.md"
if [ "$a_rc" -eq 0 ] && [ "$b_rc" -ne 0 ] \
    && printf '%s\n' "$b_out" | grep -Fq 'refused -- P9.S4 has 01-checkout/01-checkout open; a co-work slice designs one connected group as one job: draw it in this job (--job 01-checkout): an unrelated page stays on this canvas, unlinked' \
    && [ ! -e "$WR/jobs/02-settings" ] \
    && [ "$bad_rc" -ne 0 ] && printf '%s\n' "$bad_out" | grep -Fq -e "--critique 'judge' is not one of off, critic, critic+judge" \
    && [ ! -e "$WR/jobs/02-loud" ] && ww design-check >/dev/null 2>&1; then
  ok "--new-job refuses while another job of the slice has an open round, names it and points at --job (an unrelated page stays on that canvas, unlinked), and writes nothing; a bad --critique level is refused and creates nothing"
else bad "--new-job with a round open in the slice, or the critique level, is wrong (rc=$a_rc/$b_rc/$bad_rc) -- $a_out $b_out $bad_out"; fi
m_out=$( { ww design-close 01-checkout/01-checkout --superseded >/dev/null && ww design-open --slug settings --slice P9.S4 --new-job; } 2>&1); m_rc=$?
printf '# handoff\n\ncritique: off\n' > "$WR/jobs/02-settings/rounds/01-settings/handoff.md"
chk=$(ww design-check 2>&1); chk_rc=$?
if [ "$m_rc" -eq 0 ] && [ -f "$WR/jobs/02-settings/rounds/01-settings/round.json" ] \
    && python3 -c 'import json, sys; assert [json.load(open(p)).get("critique") for p in sys.argv[1:]] == ["critic", "off"]' \
         "$WR/jobs/01-checkout/rounds/01-checkout/round.json" "$WR/jobs/02-settings/rounds/01-settings/round.json" \
    && [ "$chk_rc" -eq 0 ] && printf '%s\n' "$chk" | grep -Fq 'open rounds: 02-settings/01-settings'; then
  ok "once every other round of the slice is closed, --new-job creates the merged job; --critique critic is stored, a new job's default is off, and design-check passes"
else bad "the merge path (--new-job after the close) failed (rc=$m_rc/$chk_rc) -- $m_out $chk"; fi
bare=$(ww design-open --slug again --slice P9.S4 2>&1); bare_rc=$?
{ ww design-close 02-settings/01-settings --superseded \
    && ww design-open --slug settings-v2 --slice P9.S4 --job 02-settings; } >/dev/null 2>&1; job_rc=$?
if [ "$bare_rc" -ne 0 ] && printf '%s\n' "$bare" | grep -Fq 'P9.S4 has 2 jobs (01-checkout, 02-settings); name the one this round belongs to with --job <job> (02-settings/01-settings open); a co-work slice designs one connected group as one job; draw it in this job: an unrelated page stays on this canvas, unlinked' \
    && ! printf '%s\n' "$bare" | grep -Fq -e '--new-job' \
    && [ "$job_rc" -eq 0 ] && [ ! -e "$WR/jobs/03-again" ] \
    && python3 -c 'import json, sys; d = json.load(open(sys.argv[1])); assert d["status"] == "open" and d["supersedes"] == ["01-settings"] and d["critique"] == "off", d' \
         "$WR/jobs/02-settings/rounds/02-settings-v2/round.json"; then
  ok "a bare design-open in a slice with two jobs (one closed, one open) refuses, asks for --job and names the open round, never the refused --new-job, and --job opens the job's next round after a close"
else bad "the bare design-open was not refused, or --job did not open the superseding round (rc=$bare_rc/$job_rc) -- $bare"; fi
printf '# handoff\n' > "$WR/jobs/02-settings/rounds/02-settings-v2/handoff.md"
# A legacy multi-job slice: P9.S5's jobs 03-alpha and 04-beta both open, hand-written as a wave left them.
ww design-open --slug alpha --slice P9.S5 >/dev/null 2>&1 && legacy_job "$WR" 03-alpha 01-alpha 04-beta 01-beta \
  || bad "wave probe: could not write the legacy two-job slice"
printf '# handoff\n' > "$WR/jobs/03-alpha/rounds/01-alpha/handoff.md"; printf '# handoff\n' > "$WR/jobs/04-beta/rounds/01-beta/handoff.md"
leg=$(ww design-check 2>&1); leg_rc=$?
leg_job=$( { ww design-close 04-beta/01-beta --superseded >/dev/null && ww design-open --slug beta-v2 --slice P9.S5 --job 04-beta; } 2>&1); leg_job_rc=$?
if [ "$leg_rc" -eq 0 ] && printf '%s\n' "$leg" | grep -Fq '03-alpha/01-alpha, 04-beta/01-beta' && ! printf '%s\n' "$leg" | grep -q 'warning' \
    && [ "$leg_job_rc" -eq 0 ] && [ -f "$WR/jobs/04-beta/rounds/02-beta-v2/round.json" ]; then
  ok "a legacy slice with two open jobs passes design-check with no problem and no warning, and --job opens a job's next round as before"
else bad "the legacy multi-job slice got a problem or a warning, or refused --job (rc=$leg_rc/$leg_job_rc) -- $leg $leg_job"; fi
printf '# handoff\n' > "$WR/jobs/04-beta/rounds/02-beta-v2/handoff.md"
# pages_canvas <project> <N>: N Pages (expand: fill), Main first, each linking to the next.
pages_canvas() { python3 - "$1" "$2" <<'PAGES'
import json, pathlib, shutil, sys
project, count = pathlib.Path(sys.argv[1]), int(sys.argv[2])
shutil.rmtree(project, ignore_errors=True); project.mkdir(parents=True)
names = ["Main"] + [f"Step{n}" for n in range(2, count + 1)]
boards = {f"{n}.dc.html": {"x": i * 1500, "y": 0, "w": 1440, "h": 900, "title": f"{i + 1:02d} · {n}", "expand": "fill"}
          for i, n in enumerate(names)}
(project / "canvas.json").write_text(json.dumps({"v": 3, "createdOnFiles": {"v": 1}, "boards": boards, "order": list(boards)}))
for i, name in enumerate(boards):
    nxt = f'<a href="{names[i + 1]}.dc.html">next</a>\n' if i + 1 < len(names) else ""
    (project / name).write_text('<!doctype html>\n<script src="./support.js"></script>\n<p>page</p>\n' + nxt)
PAGES
}
pages_canvas "$WR/jobs/02-settings/canvas/project" 11 || bad "wave probe: could not write the eleven-Page canvas"
out=$(ww design-check 2>&1); rc=$?
pages_canvas "$WR/jobs/02-settings/canvas/project" 10 || bad "wave probe: could not write the ten-Page canvas"
ten=$(ww design-check 2>&1); ten_rc=$?
if [ "$rc" -eq 0 ] && printf '%s\n' "$out" | grep -Fq 'warning: job 02-settings has 11 Pages / 11 boards — past one review of a connected group; split into rounds or slices along the least-connected seam' \
    && [ "$ten_rc" -eq 0 ] && ! printf '%s\n' "$ten" | grep -Fq 'past one review' && ! printf '%s\n' "$out$ten" | grep -Fq 'check=unlinked-page'; then
  ok "a job past the size threshold (11 Pages) makes design-check warn with the connected-group text, exit 0; 10 Pages does not warn"
else bad "the size warning is wrong at 11 / 10 Pages (rc=$rc/$ten_rc) -- $out $ten"; fi
# check=unlinked-page: a second Page the entry Page reaches by no link or mount warns; a mount of a flow
# board that links to it (fragment and ./ stripped) clears it.
python3 - "$WR/jobs/02-settings/canvas/project" <<'UNLINKED' || bad "wave probe: could not write the unlinked canvas"
import json, pathlib, shutil, sys
project = pathlib.Path(sys.argv[1]); shutil.rmtree(project); project.mkdir(parents=True)
boards = {"Main.dc.html": {"x": 0, "y": 0, "w": 1440, "h": 900, "title": "01 · Main", "expand": "fill"},
          "Flow.dc.html": {"x": 1500, "y": 0, "w": 400, "h": 300, "title": "02 · Flow"},
          "Other.dc.html": {"x": 2000, "y": 0, "w": 1440, "h": 900, "title": "03 · Other", "expand": "fill"}}
(project / "canvas.json").write_text(json.dumps({"v": 3, "createdOnFiles": {"v": 1}, "boards": boards, "order": list(boards)}))
for name in boards:
    (project / name).write_text('<!doctype html>\n<script src="./support.js"></script>\n<a href="{{ next }}">x</a>\n')
UNLINKED
un=$(ww design-check 2>&1); un_rc=$?
CV="$WR/jobs/02-settings/canvas/project"
printf '<dc-import name="Flow"></dc-import>\n' >> "$CV/Main.dc.html"; printf '<a href="./Other.dc.html#top">other</a>\n' >> "$CV/Flow.dc.html"
linked=$(ww design-check 2>&1); linked_rc=$?
if [ "$un_rc" -eq 0 ] && printf '%s\n' "$un" | grep -Fq "jobs/02-settings/canvas/project/Other.dc.html: Page not reachable from the entry Page Main.dc.html by a link or a mount (check=unlinked-page) -- link it from a board the entry reaches, or list it as unrelated in the round's join.json (it stays on this canvas, unlinked)" \
    && [ "$linked_rc" -eq 0 ] && ! printf '%s\n' "$linked" | grep -Fq 'check=unlinked-page'; then
  ok "design-check warns on a Page the entry Page reaches by no link or mount (check=unlinked-page), exit 0; a mounted flow board linking it clears the warning"
else bad "check=unlinked-page is wrong (rc=$un_rc/$linked_rc) -- $un $linked"; fi
# 6b. v88 (P47-p5.S4): the per-page round record. design-open --pages records the page list (a reserved
# slug refuses and writes nothing); design-check prints the round's stage= from disk; --page checks one
# page without canvas.json (a foreign-prefix board and a #to: to a non-page are problems); check=pending-link
# warns before join.json and is a problem after it, so design-close --words refuses; join.json's unrelated
# list exempts a Page from check=unlinked-page; check=token-drift and check=transition-all warn; v90 (P47-p5.F3):
# a calc(var()) radius is token-derived (silent) and a padding px only an fs- token holds gets no suggestion.
PG="$DZ/pages/.sikstack"; PR="$PG/docs/reference/design"; PJ="$PR/jobs/01-board"; PP="$PJ/canvas/project"; PRD="$PJ/rounds/01-board"
mkhost "${PG%/.sikstack}" && mkdir -p "$PG/works"
pw() { ( cd "$PG" && HOME="$DZ/home" python3 "$ENG" "$@" ); }
pw design-init --id pages >/dev/null 2>&1 || bad "pages probe: design-init failed"
res_out=$(pw design-open --slug board --slice P9.S6 --pages list,frame 2>&1); res_rc=$?
open_out=$(pw design-open --slug board --slice P9.S6 --pages list,detail 2>&1); open_rc=$?
printf '# handoff\n' > "$PRD/handoff.md"; st_frame=$(pw design-check 01-board 2>&1)
if [ "$res_rc" -ne 0 ] && printf '%s\n' "$res_out" | grep -Fq "page 'frame' is reserved" && [ "$open_rc" -eq 0 ] \
    && python3 -c 'import json, sys; assert json.load(open(sys.argv[1]))["pages"] == ["list", "detail"]' "$PRD/round.json" \
    && printf '%s\n' "$st_frame" | grep -Fqx 'design-check: 01-board/01-board stage=frame'; then
  ok "design-open --pages records the round's page list in round.json (a reserved slug refuses), and design-check prints stage=frame"
else bad "design-open --pages or the stage line is wrong (rc=$res_rc/$open_rc) -- $res_out $open_out $st_frame"; fi
# page_files <project> <round> <boards.json body> [extra List.dc.html line]: the list page's files.
page_files() { python3 - "$@" <<'PAGE'
import pathlib, sys
project, rdir, boards = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
extra = sys.argv[4] if len(sys.argv) > 4 else '<a href="#to:detail">open</a>'
project.mkdir(parents=True, exist_ok=True); (rdir / "pages/list").mkdir(parents=True, exist_ok=True)
head = '<!doctype html>\n<script src="./support.js"></script>\n'
(project / "List.dc.html").write_text(head + extra + "\n")
(project / "ListRow.dc.html").write_text(head + "<p>row</p>\n")
(rdir / "pages/list/boards.json").write_text(boards)
(rdir / "frame.md").write_text("# frame\n")
PAGE
}
LB='{"List.dc.html": {"w": 1440, "h": 900, "title": "List", "expand": "fill"}, "ListRow.dc.html": {"w": 400, "h": 80, "title": "List row"}}'
page_files "$PP" "$PRD" "$LB" || bad "pages probe: could not write the list page"
clean=$(pw design-check 01-board --page list 2>&1); clean_rc=$?
whole=$(pw design-check 01-board 2>&1); whole_rc=$?
page_files "$PP" "$PRD" "${LB%\}}, \"Detail.dc.html\": {\"w\": 1440, \"h\": 900, \"title\": \"Detail\"}}" '<a href="#to:settings">x</a>' \
  && printf '<!doctype html>\n<script src="./support.js"></script>\n' > "$PP/Detail.dc.html" || bad "pages probe: could not write the foreign board"
foreign=$(pw design-check 01-board --page list 2>&1); foreign_rc=$?
rm -f "$PP/Detail.dc.html"; page_files "$PP" "$PRD" "$LB"
if [ "$clean_rc" -eq 0 ] && printf '%s\n' "$clean" | grep -Fq 'design-check: OK -- page list of 01-board/01-board: 2 board(s), 2 file(s)' \
    && printf '%s\n' "$clean" | grep -Fqx 'design-check: 01-board/01-board stage=pages 0/2' \
    && [ "$whole_rc" -eq 0 ] && printf '%s\n' "$whole" | grep -Fq 'List.dc.html: 1 #to: placeholder link(s) left (detail) (check=pending-link)' \
    && [ "$foreign_rc" -ne 0 ] && printf '%s\n' "$foreign" | grep -Fq "board 'Detail.dc.html' is outside page list's files (a page writes only files whose stem starts List; this stem is page detail's)" \
    && printf '%s\n' "$foreign" | grep -Fq 'List.dc.html: links #to:settings, which is not a page of 01-board/01-board'; then
  ok "design-check --page passes a clean page with no canvas.json and flags a foreign-prefix board and a #to: to a non-page; the whole-job check warns check=pending-link before the join"
else bad "design-check --page is wrong (rc=$clean_rc/$whole_rc/$foreign_rc) -- $clean $whole $foreign"; fi
# The join: every page done, canvas.json written, then join.json -- the #to: left becomes a problem.
python3 - "$PP" "$PRD" <<'JOIN' || bad "pages probe: could not write the joined canvas"
import json, pathlib, sys
project, rdir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
for slug in ("list", "detail"):
    (rdir / "pages" / slug).mkdir(parents=True, exist_ok=True)
    (rdir / "pages" / slug / "result.md").write_text("- status: done\n")
boards = {"Main.dc.html": {"x": 0, "y": 0, "w": 1440, "h": 900, "title": "01 · Main", "expand": "fill"},
          "List.dc.html": {"x": 1500, "y": 0, "w": 1440, "h": 900, "title": "02 · List", "expand": "fill"},
          "ListRow.dc.html": {"x": 0, "y": 1000, "w": 400, "h": 80, "title": "03 · List row"}}
(project / "canvas.json").write_text(json.dumps({"v": 3, "createdOnFiles": {"v": 1}, "boards": boards, "order": list(boards)}))
(project / "Main.dc.html").write_text('<!doctype html>\n<script src="./support.js"></script>\n<a href="List.dc.html">list</a>\n')
JOIN
pre=$(pw design-check 01-board 2>&1); pre_rc=$?
printf '{"related": ["list"], "unrelated": []}\n' > "$PRD/join.json"
post=$(pw design-check 01-board 2>&1); post_rc=$?
pw design-canvas 01-board --url https://claude.ai/artifact/pages1 --version 1700000000-pg >/dev/null 2>&1
close=$(pw design-close 01-board/01-board --words "ship it" 2>&1); close_rc=$?
if [ "$pre_rc" -eq 0 ] && printf '%s\n' "$pre" | grep -Fqx 'design-check: 01-board/01-board stage=join' && printf '%s\n' "$pre" | grep -Fq 'warning: jobs/01-board/canvas/project/List.dc.html: 1 #to: placeholder link(s) left (detail) (check=pending-link)' \
    && [ "$post_rc" -ne 0 ] && printf '%s\n' "$post" | grep -Fqx 'design-check: 01-board/01-board stage=joined' \
    && printf '%s\n' "$post" | grep -Fq -- '- jobs/01-board/canvas/project/List.dc.html: 1 #to: placeholder link(s) left (detail) (check=pending-link) -- the join rewires each to a real link; design-close --words refuses while one is left' \
    && [ "$close_rc" -ne 0 ] && printf '%s\n' "$close" | grep -Fq 'check=pending-link' \
    && python3 -c 'import json, sys; assert json.load(open(sys.argv[1]))["status"] == "open"' "$PRD/round.json"; then
  ok "check=pending-link is a warning before join.json (stage=join) and a problem after it (stage=joined), and design-close --words refuses the round"
else bad "check=pending-link or the close refusal is wrong (rc=$pre_rc/$post_rc/$close_rc) -- $pre $post $close"; fi
# The unrelated-page exemption, and the style lints on a frame.css that names tokens.
python3 - "$PP" <<'UNREL' || bad "pages probe: could not write the unrelated Page"
import json, pathlib, sys
project = pathlib.Path(sys.argv[1]); index = json.loads((project / "canvas.json").read_text())
index["boards"]["Detail.dc.html"] = {"x": 3000, "y": 0, "w": 1440, "h": 900, "title": "04 · Detail", "expand": "fill"}
index["order"].append("Detail.dc.html"); (project / "canvas.json").write_text(json.dumps(index))
head = '<!doctype html>\n<script src="./support.js"></script>\n'
(project / "Detail.dc.html").write_text(head + "<p>detail</p>\n")
(project / "List.dc.html").write_text(head + '<a href="Main.dc.html">back</a>\n')
(project / "frame.css").write_text(":root { --ink: #1a1a1a; --radius-md: 6px; --space-4: 16px; --fs-14: 14px; }\n")
(project / "ListRow.dc.html").write_text(head + '<style>.row { color: #1A1A1A; border: 1px solid var(--ink); padding: 16px; '
    'border-radius: 50%; transition: all .2s; } .cap { border-radius: calc(var(--radius-md) - 1px); padding: 14px; } '
    '[data-proto="state-bar"] { background: #ff0000; }</style>\n<p class="row">row</p>\n')
UNREL
un=$(pw design-check 01-board 2>&1); un_rc=$?
printf '{"related": ["list"], "unrelated": ["detail"]}\n' > "$PRD/join.json"
ex=$(pw design-check 01-board 2>&1); ex_rc=$?
printf '<a href="Detail.dc.html">detail</a>\n' >> "$PP/Main.dc.html"
reached=$(pw design-check 01-board 2>&1)
if [ "$un_rc" -eq 0 ] && printf '%s\n' "$un" | grep -Fq "Detail.dc.html: Page not reachable from the entry Page Main.dc.html by a link or a mount (check=unlinked-page) -- link it from a board the entry reaches, or list it as unrelated in the round's join.json (it stays on this canvas, unlinked)" \
    && [ "$ex_rc" -eq 0 ] && ! printf '%s\n' "$ex" | grep -Fq 'check=unlinked-page' \
    && printf '%s\n' "$reached" | grep -Fq "Detail.dc.html: the round's join.json lists this Page as unrelated, but the entry Page Main.dc.html reaches it (check=unlinked-page)" \
    && printf '%s\n' "$ex" | grep -Fq 'ListRow.dc.html: 2 raw value(s) where the system or frame.css names a token (check=token-drift): #1A1A1A (color = var(--ink)), 16px (padding = var(--space-4))' \
    && ! printf '%s\n' "$ex" | grep -Fq -e '#ff0000' -e '50%' -e 'calc(' -e 'fs-14' \
    && printf '%s\n' "$ex" | grep -Fq 'ListRow.dc.html: transition: all (check=transition-all)'; then
  ok "join.json's unrelated list exempts a Page from check=unlinked-page (a reached one warns); check=token-drift names raw values a token names, allowing 1px borders, %, [data-proto] chrome and a calc(var()) radius and suggesting no cross-role token; check=transition-all warns"
else bad "the unrelated-page exemption or the style lints are wrong (rc=$un_rc/$ex_rc) -- $un $ex $reached"; fi
# 6c. v88 (P47-p5.S5): design-preview --page renders one page of a per-page round from its boards.json (a
# synthesized index.json in the render folder, never canvas.json), into .preview/<job>/<round>/pages/<slug>/,
# and only that page's boards; check=align names one known miss per cheap kind (first-line, beside-control,
# control-height), each printed line with its 2x zoom crop beside the render, and self_check is unchanged
# (advisory). With no browser the block says so and asserts nothing.
AL="$DZ/align/.sikstack"; AR="$AL/docs/reference/design"; AJ="$AR/jobs/01-rows"; AP="$AJ/canvas/project"; ARD="$AJ/rounds/01-rows"
mkhost "${AL%/.sikstack}" && mkdir -p "$AL/works"
aw() { ( cd "$AL" && python3 "$ENG" "$@" ); }
{ aw design-init --id align && aw design-open --slug rows --slice P9.S7 --pages list,detail; } >/dev/null 2>&1 || bad "align probe: design-init or design-open --pages failed"
printf '# handoff\n' > "$ARD/handoff.md"
python3 - "$AP" "$ARD" <<'ALIGN' || bad "align probe: could not write the page fixtures"
import json, pathlib, sys
project, rdir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
project.mkdir(parents=True, exist_ok=True)
head = '<!doctype html>\n<html><head>\n<script src="./support.js"></script>\n</head>\n'
btn = 'style="width:64px;height:{h}px;background:#fff;border:1px solid #555;color:#111;font:16px Arial,sans-serif"'
(project / "ListAlign.dc.html").write_text(head + '<body style="margin:0;background:#fff;color:#111;font:16px/1.25 Arial,sans-serif"><x-dc>\n'
    '<div style="display:flex;align-items:center;gap:16px;width:420px;margin:24px"><span style="width:140px">A cell that wraps onto two lines</span><span>Short</span></div>\n'
    f'<div style="display:flex;align-items:flex-start;gap:16px;margin:24px"><span>Label</span><button type="button" {btn.format(h=44)}>Act</button></div>\n'
    f'<div style="display:flex;align-items:flex-start;gap:16px;margin:24px"><button type="button" {btn.format(h=44)}>One</button><button type="button" {btn.format(h=40)}>Two</button></div>\n'
    '</x-dc></body></html>\n', encoding="utf-8")
(project / "Detail.dc.html").write_text(head + '<body><x-dc><p>detail</p></x-dc></body></html>\n', encoding="utf-8")
for slug, boards in (("list", {"ListAlign.dc.html": {"w": 520, "h": 360, "title": "Rows"}}),
                     ("detail", {"Detail.dc.html": {"w": 400, "h": 200, "title": "Detail"}})):
    (rdir / "pages" / slug).mkdir(parents=True, exist_ok=True)
    (rdir / "pages" / slug / "boards.json").write_text(json.dumps(boards), encoding="utf-8")
ALIGN
printf '/* a stand-in runtime: the fixture boards need none */\n' > "$AL/stub-runtime.js"
al_out=$(aw design-preview 01-rows --runtime stub-runtime.js --page list 2>&1); al_rc=$?
bad_out=$(aw design-preview 01-rows --runtime stub-runtime.js --page nope 2>&1); bad_rc=$?
if printf '%s\n' "$al_out" | grep -qx 'preview=skipped reason=no-browser'; then
  printf 'SKIP: %s\n' "design-preview --page and check=align on fixture boards: no Chrome/Chromium on this machine (nothing asserted)"
else
  ALO="$AR/.preview/01-rows/01-rows/pages/list"
  has() { printf '%s\n' "$al_out" | grep -Eq "$1"; }
  [ "$al_rc" -eq 0 ] && has '^board=ListAlign\.dc\.html ' && ! has 'board=Detail\.dc\.html' && [ -f "$ALO/ListAlign.frame.png" ] \
    && [ -f "$ALO/index.json" ] && [ ! -e "$AP/canvas.json" ] && has '^self_check=pass blocking=none$' \
    && [ "$bad_rc" -ne 0 ] && printf '%s\n' "$bad_out" | grep -Fq "design-preview: --page 'nope' is not a page of 01-rows/01-rows (pages: list, detail; or frame)" \
    && ok "design-preview --page renders only that page's boards from its boards.json into .preview/<job>/<round>/pages/<slug>/ (index.json there, no canvas.json written), self_check unchanged; an unknown page refuses" \
    || bad "design-preview --page is wrong (rc=$al_rc/$bad_rc) -- $al_out $bad_out"
  has 'board=ListAlign\.dc\.html view=frame check=align: first-line [0-9.]+px \(span "A cell that wraps o…" vs span "Short"\)' \
    && has 'check=align: beside-control [0-9.]+px \(span "Label" vs button "Act"\)' \
    && has 'check=align: control-height 4px \(button "One" vs button "Two"\)' \
    && has 'check=align: first-line .* crop=.*/ListAlign\.align-0[1-9]\.png$' && [ -f "$ALO/ListAlign.align-01.png" ] \
    && has '^advisory=align:[0-9]' \
    && ok "check=align names a first-line, a beside-control and a control-height miss, each line ending with its 2x zoom crop beside the render; advisory= counts them" \
    || bad "check=align missed a fixture miss or its crop -- $(printf '%s\n' "$al_out" | grep -E 'align|advisory')"
fi
# 7. P36.S8C: the board lint and the board count. A link to an outside https page (Google Fonts CSS
# excepted) and a <sc-for> whose every row links to one board are warnings; a board another board
# <dc-import>s is not counted (34 boards, 4 mounted: 30 counted, no size warning); bar.md at the root is no stray.
python3 - "$WR" <<'LINT' || bad "lint probe: could not write the canvas"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1]); project = root / "jobs/01-checkout/canvas/project"; project.mkdir(parents=True, exist_ok=True)
(root / "bar.md").write_text("# The operator's bar\n\n- none beyond the shipped bar\n")
names = ["Main", "Item"] + [f"Part{n}" for n in range(1, 33)]
boards = {f"{n}.dc.html": {"x": i * 500, "y": 0, "w": 400, "h": 300, "title": f"{i + 1:02d} · {n}"} for i, n in enumerate(names)}
(project / "canvas.json").write_text(json.dumps({"v": 3, "createdOnFiles": {"v": 1}, "boards": boards, "order": list(boards)}))
head = '<!doctype html>\n<script src="./support.js"></script>\n'
for name in boards:
    (project / name).write_text(head + "<p>board</p>\n")
(project / "Main.dc.html").write_text(head + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">\n'
    '<sc-for list="{{ rows }}" as="r"><a href="Item.dc.html">{{ r.name }}</a></sc-for>\n'
    '<a href="https://elsewhere.example/sign-in">Sign in</a>\n'
    '<dc-import name="Part1"></dc-import><dc-import name="Part2"></dc-import><dc-import name="Part3"></dc-import><dc-import name="Part4"></dc-import>\n')
LINT
out=$(ww design-check 01-checkout 2>&1); rc=$?
all_out=$(ww design-check 2>&1); all_rc=$?
if [ "$rc" -eq 0 ] && [ "$all_rc" -eq 0 ] && ! printf '%s\n' "$all_out" | grep -Fq 'bar.md' \
    && printf '%s\n' "$out" | grep -Fq 'Main.dc.html: 1 link(s) leave the prototype (check=leaves-canvas): https://elsewhere.example/sign-in' \
    && ! printf '%s\n' "$out" | grep -Fq 'fonts.googleapis.com' \
    && printf '%s\n' "$out" | grep -Fq 'Main.dc.html: every row of a <sc-for> list links to Item.dc.html (check=same-target-list)' \
    && ! printf '%s\n' "$out" | grep -Fq 'past one review' && ! printf '%s\n' "$out" | grep -Fq 'bar.md'; then
  ok "design-check warns on a link leaving the prototype (not Google Fonts) and on a list whose rows all link to one board, exit 0; boards another board mounts are not counted (34 boards, 4 mounted: no size warning); bar.md is no stray"
else bad "the board lint, the mounted-board count or bar.md is wrong (rc=$rc/$all_rc) -- $out $all_out"; fi

# 8. v61 (P37.S5): the design lifecycle one-liners. The publish records a size manifest; design-readback
# reads a canvas listing (no hash) and names only what to fetch; --fetched diffs, --apply copies in;
# design-close generates SIGNOFF.md and refuses without a read-back; design-sign signs every presented job
# or none; a superseding round's critique defaults off; the record carries repo-relative paths only, and a
# brief a handoff names must exist. Its second job is a legacy wave's (hand-written: --new-job now refuses
# while the slice's first round is open), so design-sign --slice signs a legacy slice's presented jobs.
LF="$DZ/life/.sikstack"; LR="$LF/docs/reference/design"
mkhost "${LF%/.sikstack}" && mkdir -p "$LF/works"
lw() { ( cd "$LF" && HOME="$DZ/home" python3 "$ENG" "$@" ); }
lw design-init --id life >/dev/null 2>&1 && lw design-open --slug one --slice P9.S7 --critique critic >/dev/null 2>&1 \
  && legacy_job "$LR" 01-one 01-one 02-two 01-two || bad "life probe: design-open failed"
python3 - "$LR" <<'LIFE' || bad "life probe: could not write the canvases"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
(root / "waves/P9.S7").mkdir(parents=True, exist_ok=True)
(root / "waves/P9.S7/brief.md").write_text("# Wave P9.S7\n\nruntime: docs/reference/design/.type/artifact-type/dc-runtime.js\n")
for job, rnd in (("01-one", "01-one"), ("02-two", "01-two")):
    project = root / "jobs" / job / "canvas/project"; project.mkdir(parents=True, exist_ok=True)
    boards = {"Main.dc.html": {"x": 0, "y": 0, "w": 400, "h": 300, "title": "01 · Main"},
              "Two.dc.html": {"x": 500, "y": 0, "w": 400, "h": 300, "title": "02 · Two"}}
    (project / "canvas.json").write_text(json.dumps({"v": 3, "createdOnFiles": {"v": 1}, "boards": boards, "order": list(boards)}))
    for name in boards:
        (project / name).write_text('<!doctype html>\n<script src="./support.js"></script>\n<p>' + name + '</p>\n')
    (project / "app.css").write_text("p { color: #222; }\n")
    rdir = root / "jobs" / job / "rounds" / rnd
    (rdir / "handoff.md").write_text("# handoff\n\nbrief: waves/P9.S7/brief.md\ncritique: off\n")
    (rdir / "result.md").write_text("- verdict: done\n- open_items: D1, D2\n\n## Summary\n\nTwo boards.\n\n## Build\n\nBuild both.\n")
LIFE
printf '# handoff\n\nbrief: waves/P9.S7/brief.md\nruntime: /private/tmp/scratch/dc-runtime.js\n' > "$LR/jobs/01-one/rounds/01-one/handoff.md"
abs_out=$(lw design-check 2>&1); abs_rc=$?
printf '# handoff\n\nbrief: waves/P9.S7/brief.md\ncritique: critic\n' > "$LR/jobs/01-one/rounds/01-one/handoff.md"
mv "$LR/waves/P9.S7/brief.md" "$DZ/brief.md"; brief_out=$(lw design-check 2>&1); brief_rc=$?; mv "$DZ/brief.md" "$LR/waves/P9.S7/brief.md"
clean_out=$(lw design-check 2>&1); clean_rc=$?
if [ "$abs_rc" -eq 1 ] && printf '%s\n' "$abs_out" | grep -Fq 'jobs/01-one/rounds/01-one/handoff.md: an absolute path (check=abs-path): line 4 /private/' \
    && [ "$brief_rc" -eq 1 ] && printf '%s\n' "$brief_out" | grep -Fq 'jobs/02-two/rounds/01-two/handoff.md: names brief waves/P9.S7/brief.md, which is missing' \
    && [ "$clean_rc" -eq 0 ] && grep -qx '\*' "$LR/.type/.gitignore"; then
  ok "design-check makes an absolute path in an open round's handoff a problem and a missing named wave brief a problem; the record passes with repo-relative paths, and design-open git-ignores the type cache"
else bad "the absolute-path lint or the brief check is wrong (rc=$abs_rc/$brief_rc/$clean_rc) -- $abs_out $brief_out $clean_out"; fi
{ lw design-canvas 01-one --url https://claude.ai/artifact/LifeOne && lw design-canvas 01-one --version 300-a \
    && lw design-canvas 02-two --url https://claude.ai/artifact/LifeTwo && lw design-canvas 02-two --version 400-a; } >/dev/null 2>&1 \
  || bad "life probe: design-canvas failed"
python3 - "$LR/jobs/01-one" <<'MANIFEST' && ok "design-canvas --version records the publish's size manifest in job.json and the version on the open round" || bad "design-canvas recorded no manifest or no round publish"
import json, pathlib, sys
job = pathlib.Path(sys.argv[1]); project = job / "canvas/project"
manifest = json.loads((job / "job.json").read_text())["canvas"]["manifest"]
assert manifest == {f"project/{f.name}": f.stat().st_size for f in project.iterdir() if f.is_file()}, manifest
assert json.loads((job / "rounds/01-one/round.json").read_text())["published"] == "300-a"
MANIFEST
# listing <version> [<file to grow by 9 bytes>]: an Artifact list scope:files output of job 01-one's local tree
listing() { python3 - "$LR/jobs/01-one/canvas/project" "$1" "${2:-}" <<'LISTING'
import pathlib, sys
project, version, grow = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
print(f'Published files of https://claude.ai/artifact/LifeOne (version {version}), an Artifact of type "Design", 9 files by path:')
for path, size in (("SKILL.md", 16042), ("index.html", 34176), ("artifact-type/dc-runtime.js", 187897), ("project/ds/life/tokens.css", 900)):
    print(f'- "{path}"  text/plain  {size} bytes')
for f in sorted(project.iterdir()):
    print(f'- "project/{f.name}"  text/plain  {f.stat().st_size + (9 if f.name == grow else 0)} bytes')
LISTING
}
close_out=$(lw design-close 01-one/01-one --words "ship it" 2>&1); close_rc=$?
same=$(listing 300-a | lw design-readback 01-one --listing - 2>&1)
moved=$(listing 301-b app.css | lw design-readback 01-one --listing - 2>&1)
unloc=$(listing 302-c | lw design-readback 01-one --listing - 2>&1)
if [ "$close_rc" -ne 0 ] && printf '%s\n' "$close_out" | grep -Fq 'no read-back since the last publish (300-a): run design-readback 01-one --listing' \
    && [ ! -e "$LR/jobs/01-one/rounds/01-one/SIGNOFF.md" ] \
    && printf '%s\n' "$same" | grep -qx 'readback=unchanged version=300-a' \
    && printf '%s\n' "$moved" | grep -qx 'readback=changed version=301-b files=1' && printf '%s\n' "$moved" | grep -qx 'fetch=project/app.css' \
    && printf '%s\n' "$unloc" | grep -qx 'readback=changed-unlocated version=302-c reason=same-sizes files=2' \
    && printf '%s\n' "$unloc" | grep -qx 'fetch=project/Main.dc.html,project/Two.dc.html' \
    && ! printf '%s\n%s\n%s\n' "$same" "$moved" "$unloc" | grep -Eq 'SKILL|artifact-type|index.html|ds/|color'; then
  ok "design-close --words refuses with no read-back and writes nothing; design-readback reads a listing: same version unchanged, a resized file changed (only it fetched), same sizes changed-unlocated (the boards fetched), the type's files and ds/ ignored, no content printed"
else bad "the read-back of a listing is wrong (close rc=$close_rc) -- $close_out / $same / $moved / $unloc"; fi
listing 303-d app.css | lw design-readback 01-one --listing - >/dev/null 2>&1
mkdir -p "$DZ/fetched/project" && printf 'p { color: #222; }\nb { font-weight: 600; }\n' > "$DZ/fetched/project/app.css"
diff_out=$(lw design-readback 01-one --fetched "$DZ/fetched" 2>&1); diff_rc=$?
cmp -s "$DZ/fetched/project/app.css" "$LR/jobs/01-one/canvas/project/app.css" && copied_early=1 || copied_early=0
apply_out=$(lw design-readback 01-one --fetched "$DZ/fetched" --apply 2>&1); apply_rc=$?
if [ "$diff_rc" -eq 0 ] && printf '%s\n' "$diff_out" | grep -qx 'diff=project/app.css +1 -0' && printf '%s\n' "$diff_out" | grep -q '^readback=differs ' \
    && [ "$copied_early" -eq 0 ] && [ -f "$DZ/fetched/readback.diff" ] \
    && [ "$apply_rc" -eq 0 ] && printf '%s\n' "$apply_out" | grep -q '^readback=edited version=303-d files=1' \
    && cmp -s "$DZ/fetched/project/app.css" "$LR/jobs/01-one/canvas/project/app.css"; then
  ok "design-readback --fetched prints diff=<path> +A -B and writes the diff to the scratch dir only; --apply copies the fetched file over the canvas file (read-back edited)"
else bad "design-readback --fetched / --apply is wrong (rc=$diff_rc/$apply_rc) -- $diff_out / $apply_out"; fi
sign_no=$(lw design-sign --slice P9.S7 --words "accept" 2>&1); sign_no_rc=$?
st() { python3 -c 'import json, sys; print(" ".join(json.load(open(p))["status"] for p in sys.argv[1:]))' "$@"; }
no_state=$(st "$LR/jobs/01-one/rounds/01-one/round.json" "$LR/jobs/02-two/rounds/01-two/round.json")
[ -e "$LR/jobs/01-one/rounds/01-one/SIGNOFF.md" ] && no_state="$no_state signoff-written"
printf 'Published files of x (version 400-a), 1 file:\n- "project/Main.dc.html"  text/html  80 bytes\n' | lw design-readback 02-two --listing - >/dev/null 2>&1
sign_out=$(lw design-sign --slice P9.S7 --words "accept" 2>&1); sign_rc=$?
if [ "$sign_no_rc" -ne 0 ] && printf '%s\n' "$sign_no" | grep -Fq '02-two/01-two: no read-back since the last publish (400-a)' \
    && [ "$no_state" = "open open" ] \
    && [ "$sign_rc" -eq 0 ] && printf '%s\n' "$sign_out" | grep -qx 'signed=01-one/01-one version=303-d readback=edited open_items=D1,D2 files=4' \
    && printf '%s\n' "$sign_out" | grep -qx 'signed=02-two/01-two version=400-a readback=unchanged open_items=D1,D2 files=4' \
    && [ "$(st "$LR/jobs/01-one/rounds/01-one/round.json" "$LR/jobs/02-two/rounds/01-two/round.json" "$LR/jobs/01-one/job.json" "$LR/jobs/02-two/job.json")" = "signed signed signed signed" ] \
    && [ -f "$LR/jobs/02-two/rounds/01-two/SIGNOFF.md" ] && lw design-check >/dev/null 2>&1; then
  ok "design-sign signs neither job while one lacks a read-back, then signs both presented jobs in one call, one line each"
else bad "design-sign is not all-or-nothing or did not sign both (rc=$sign_no_rc/$sign_rc) -- $sign_no / $sign_out"; fi
sup_out=$(lw design-open --slug one-fix --slice P9.S7 --job 01-one 2>&1)
RD="$LR/jobs/01-one/rounds/02-one-fix"
printf '# handoff\n\nbrief: waves/P9.S7/brief.md\ncritique: off\n' > "$RD/handoff.md"
printf -- '- verdict: done\n- open_items: none\n\n## Summary\n\nFixed.\n\n## Build\n\nAs drawn.\n' > "$RD/result.md"
printf -- '- verdict: pass\n- open_items: C4, C7\n' > "$RD/critique-01.md"
{ lw design-canvas 01-one --version 500-e && listing 500-e | lw design-readback 01-one --listing -; } >/dev/null 2>&1
close_out=$(lw design-close 01-one/02-one-fix --words "ship it, as drawn" 2>&1); close_rc=$?
if printf '%s\n' "$sup_out" | grep -Fq 'critique off (a superseding round'"'"'s default' \
    && python3 -c 'import json, sys; assert json.load(open(sys.argv[1]))["critique"] == "off"' "$RD/round.json" \
    && [ "$close_rc" -eq 0 ] && printf '%s\n' "$close_out" | grep -Fq 'SIGNOFF.md generated' \
    && grep -qx '  > ship it, as drawn' "$RD/SIGNOFF.md" && grep -qx -- '- \*\*Canvas version:\*\* 500-e' "$RD/SIGNOFF.md" \
    && grep -qx -- '- \*\*Read-back:\*\* unchanged at 500-e (published 500-e)' "$RD/SIGNOFF.md" \
    && grep -qx -- '- \*\*Open items:\*\* C4, C7' "$RD/SIGNOFF.md" && grep -qx -- '- \*\*Supersedes:\*\* 01-one' "$RD/SIGNOFF.md"; then
  ok "a superseding round defaults critique off; design-close --words generates SIGNOFF.md: the words verbatim, the canvas version, the read-back and the open-item ids"
else bad "the superseding round's critique or the generated SIGNOFF.md is wrong (close rc=$close_rc) -- $sup_out / $close_out / $(cat "$RD/SIGNOFF.md" 2>&1)"; fi

# ---------------------------------------------------------------------------
echo "== Test 14: P28 nested engine -- .sikstack/.agentic-nested.json: host anchors, host-side phase scope, the paired worktree lifecycle (v86: an explain phase's detached pair), the convention gate, a malformed marker fails validate =="
# A host repo with one product commit and its workspace made by `sikstack init` at host/.sikstack/, its marker
# rewritten below. Every command runs from the host root, the way a session does.
newtmp NS
NH="$NS/host"
mkhost "$NH" && ( cd "$NH" && mkdir -p src && printf 'print("host")\n' > src/app.py && git add src >/dev/null 2>&1 \
       && git commit -qm "host baseline" >/dev/null 2>&1 ) \
  || bad "nested probe: could not build the host + .sikstack/ fixture"
cat > "$NH/.sikstack/.agentic-nested.json" <<'NESTED'
{"schema": 1, "host_root": "..",
 "commit_convention": {"inferred": "type(scope): summary", "confirmed": false, "text": null, "coauthor_trailers": "unknown"},
 "renames": {"skills": {}, "agents": {"design-drafter": "wf-design-drafter"}}}
NESTED
nw() { ( cd "$NH" && python3 "$(wf_entry "$1")" "$@" ); }
{ nw check && nw phase new --phase P1 --name "Nested probe" --objective "probe the host"; } >/dev/null 2>&1 \
  || bad "nested probe: rebuild / phase new failed"
host_head=$( cd "$NH" && git rev-parse HEAD )
if python3 - "$NH/.sikstack/works/phases/active/P1/phase.json" "$host_head" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("host_anchors") == {"created": sys.argv[2]}, data.get("host_anchors")
PY
then ok "phase new records host_anchors.created = the host HEAD in phase.json"; else bad "phase.json carries no host anchor equal to the host HEAD"; fi
# The host's own docs/ is product; an untracked file inside the nested repo is not.
mkdir -p "$NH/docs" && printf 'guide\n' > "$NH/docs/guide.md" && printf 'print("feature")\n' > "$NH/src/feature.py"
( cd "$NH" && git add src docs >/dev/null 2>&1 && git commit -qm "product change" >/dev/null 2>&1 ) || bad "nested probe: could not commit the product change"
printf 'scratch\n' > "$NH/.sikstack/scratch.txt"
scope_out=$(nw phase scope P1 2>&1); scope_rc=$?
[ "$scope_rc" -eq 0 ] && printf '%s\n' "$scope_out" | grep -q "^mode=nested$" \
  && printf '%s\n' "$scope_out" | grep -q "^base=$host_head (" \
  && printf '%s\n' "$scope_out" | grep -qx "  A src/feature.py" && printf '%s\n' "$scope_out" | grep -qx "  A docs/guide.md" \
  && ! printf '%s\n' "$scope_out" | grep -qE "^  [AMDR] (\.sikstack/|src/app.py)" \
  && ok "phase scope reads the host repo from the anchor: the product commit's files (the host's docs/ included), nothing under .sikstack/" \
  || bad "nested phase scope did not read the host boundary (rc=$scope_rc) -- $scope_out"
printf '%s\n' "$scope_out" | grep -qx "pathspec=. ':(exclude).sikstack'" && [ "$(nw phase scope --pathspec 2>&1)" = "pathspec=. ':(exclude).sikstack'" ] \
  && ok "nested phase scope and phase scope --pathspec print the host pathspec: the .sikstack/ folder excluded, the host's docs/ kept" \
  || bad "nested pathspec= line missing or wrong -- $scope_out"
ps_out=$(nw worktree start P1 2>&1); ps_rc=$?
[ "$ps_rc" -ne 0 ] && printf '%s\n' "$ps_out" | grep -q "^worktree start in a nested install needs --host-branch <name>" \
  && ! grep -q '"execution"' "$NH/.sikstack/works/phases/active/P1/phase.json" \
  && ok "nested worktree start without --host-branch refuses and writes nothing" || bad "nested worktree start did not refuse a missing --host-branch (rc=$ps_rc) -- $ps_out"
nx=$(nw next 2>&1)
printf '%s\n' "$nx" | grep -q "^nested_host=/" && printf '%s\n' "$nx" | grep -q "^host_commit_convention=UNCONFIRMED (inferred: type(scope): summary)" \
  && printf '%s\n' "$nx" | grep -qx "slice_path=.sikstack/works/phases/active/P1/slices/P1.DECOMP" \
  && ok "next names the host, holds the unconfirmed convention, and prints host-relative paths" || bad "nested next lines missing -- $nx"
nw repo convention --confirm --text "type(scope): summary" --trailers forbidden >/dev/null 2>&1 || bad "nested probe: repo convention --confirm failed"
nx=$(nw next 2>&1)
if printf '%s\n' "$nx" | grep -q "^host_commit_convention=confirmed (coauthor_trailers=forbidden)" && ! printf '%s\n' "$nx" | grep -q "UNCONFIRMED" \
    && python3 -c 'import json,sys; c=json.load(open(sys.argv[1]))["commit_convention"]; assert c["confirmed"] is True and c["text"] == "type(scope): summary" and c["inferred"] == "type(scope): summary", c' "$NH/.sikstack/.agentic-nested.json"; then
  ok "repo convention --confirm records the text and the trailer rule, and next stops flagging it"; else bad "repo convention --confirm did not flip the convention -- $nx"; fi
nw check --no-rebuild >/dev/null 2>&1 && ok "validate passes on a well-formed nested install" || bad "validate failed on a well-formed nested install -- $(nw check --no-rebuild 2>&1)"
# v61: the resume card from the host prints host-relative paths, within its 2,048 B.
card=$(nw next --card 2>&1); cr_rc=$?
[ "$cr_rc" -eq 0 ] && [ "$(printf '%s' "$card" | wc -c | tr -d ' ')" -le 2048 ] && printf '%s\n' "$card" | grep -qx 'phase: .sikstack/works/phases/active/P1/phase.md' \
  && printf '%s\n' "$card" | grep -qF 'commands run as `sikstack <command>`' \
  && ok "nested: next --card names host-relative paths and the nested engine command, within 2,048 B" || bad "nested next --card wrong (rc=$cr_rc): $card"
printf '{"schema": 1, "host_root": ".."' > "$NH/.sikstack/.agentic-nested.json"
val_out=$(nw check --no-rebuild 2>&1); val_rc=$?; nx_out=$(nw next 2>&1); nx_rc=$?
[ "$val_rc" -ne 0 ] && printf '%s\n' "$val_out" | grep -Fq ".agentic-nested.json: cannot be read as JSON" \
  && [ "$nx_rc" -ne 0 ] && printf '%s\n' "$nx_out" | grep -Fq ".agentic-nested.json is malformed" \
  && ok "a malformed .agentic-nested.json fails validate and stops every other command (never read as at-root mode)" \
  || bad "a malformed .agentic-nested.json passed validate or ran next (rc=$val_rc/$nx_rc) -- $val_out $nx_out"
cr_out=$(printf '{}' | nw compact-resume 2>&1); cr_rc=$?
[ "$cr_rc" -eq 0 ] && [ "$(printf '%s\n' "$cr_out" | head -1)" = "compaction=done source=compact" ] \
  && ok "a malformed marker never stops the resume hook: the adapter's compact-resume still runs and exits 0" \
  || bad "the resume hook refused on a malformed marker (rc=$cr_rc): $cr_out"
# The paired worktree lifecycle (P35): a nested phase runs in a host worktree with the nested worktree inside,
# claims its own stream, shows in the main backlog's Streams view, resumes through the compaction hook's cwd, is
# guarded at teardown and is retired nested-first, keeping the host branch. It runs last: it restores a valid
# marker (the truncated one above is the previous assertion's) and commits the fixture's nested repo.
cat > "$NH/.sikstack/.agentic-nested.json" <<'NESTED'
{"schema": 1, "host_root": "..",
 "commit_convention": {"inferred": "type(scope): summary", "confirmed": true, "text": "type(scope): summary", "coauthor_trailers": "forbidden"},
 "renames": {"skills": {}, "agents": {"design-drafter": "wf-design-drafter"}}}
NESTED
NW="$NH/.sikstack"
printf '/workflow/\n/.claude/agents/\n' >> "$NH/.git/info/exclude"
printf 'temp/\n' >> "$NW/.git/info/exclude"
( cd "$NW" && git config user.email smoke@example.invalid && git config user.name smoke && git branch -M main >/dev/null 2>&1 \
    && git add -A >/dev/null 2>&1 && git commit -qm "nested baseline" >/dev/null 2>&1 ) || bad "paired lifecycle: could not commit the nested fixture"
nw check >/dev/null 2>&1; ( cd "$NW" && git add -A >/dev/null 2>&1 && git commit -qm "rebuild" >/dev/null 2>&1 )
ps_out=$(nw worktree start P1 --host-branch feat/side 2>&1); ps_rc=$?
HWT=$(printf '%s\n' "$ps_out" | sed -n 's/^host_worktree=//p'); PBR=$(printf '%s\n' "$ps_out" | sed -n 's/^branch=//p')
if [ "$ps_rc" -eq 0 ] && [ -d "$HWT/.sikstack" ] && git -C "$NH" worktree list | grep -qF "$HWT" && git -C "$NW" worktree list | grep -qF "$HWT/.sikstack" \
    && [ -z "$(git -C "$NH" status --short)" ]; then
  ok "paired worktree start: both repos list the new worktree, <host-wt>/.sikstack exists and the host's git status is empty"
else bad "paired worktree start (rc=$ps_rc) -- $ps_out -- host status: $(git -C "$NH" status --short)"; fi
wt_next=$( cd "$HWT" && python3 "$ENG" next 2>&1 ); main_next=$(nw next 2>&1)
nw check >/dev/null 2>&1
if printf '%s\n' "$wt_next" | grep -q "^stream=phase/P1-" && ! printf '%s\n' "$main_next" | grep -q "^current_phase=P1" \
    && grep -A8 '^## Streams' "$NW/backlog.md" | grep -E '^\|' | grep -F 'P1' | grep -qF 'feat/side'; then
  ok "the worktree's next prints stream=phase/P1-..., the main checkout skips P1, and backlog.md's ## Streams row carries P1 with feat/side"
else bad "stream claim or Streams row wrong -- worktree: $wt_next -- main: $main_next -- $(grep -A8 '^## Streams' "$NW/backlog.md")"; fi
# v67: a state change in the worktree refreshes the main checkout's backlog, read from the worktree's files (uncommitted).
( cd "$HWT" && python3 "$ENG" slice status P1.DECOMP in_progress >/dev/null 2>&1 )
grep -F '`P1.DECOMP`' "$NW/backlog.md" | grep -qF '`in_progress`' && grep -qF '_Read live from its worktree `' "$NW/backlog.md" \
  && ok "a slice status changed in the worktree shows in the main checkout's backlog, with nothing run there" \
  || bad "the main backlog did not follow the worktree -- $(grep -F 'P1.' "$NW/backlog.md")"
hook_out=$(cd "$NS" && printf '{"session_id":"t","source":"compact","cwd":"%s"}' "$HWT" | CLAUDE_PROJECT_DIR="$NH" python3 "$PLUGIN/hooks/compact_resume.py" 2>&1)
printf '%s\n' "$hook_out" | grep -q "^stream=phase/P1-" && printf '%s\n' "$hook_out" | grep -q "^pointer: phase P1 " \
  && ok "the plugin's compact-resume hook, given the worktree's cwd, answers from the worktree's own .sikstack/ stream" \
  || bad "the compaction hook did not follow the worktree cwd -- $hook_out"
printf 'product\n' > "$HWT/src/side.py" && git -C "$HWT" add src/side.py >/dev/null 2>&1 && git -C "$HWT" commit -qm "side" >/dev/null 2>&1
mkdir -p "$HWT/.sikstack/temp" && printf 'note\n' > "$HWT/.sikstack/temp/note.txt"
git -C "$HWT/.sikstack" checkout -q -- . >/dev/null 2>&1   # drop the regenerated works/ files `next` rewrote
printf 'merged\n' > "$HWT/.sikstack/merged.txt" && git -C "$HWT/.sikstack" add -A >/dev/null 2>&1 && git -C "$HWT/.sikstack" commit -qm "phase work" >/dev/null 2>&1
git -C "$NW" add -A >/dev/null 2>&1 && git -C "$NW" commit -qm "regenerated works" >/dev/null 2>&1
git -C "$NW" merge --no-ff -q -m "merge phase" "$PBR" >/dev/null 2>&1 || bad "paired lifecycle: could not merge $PBR into the nested default branch"
td_out=$(nw worktree teardown P1 2>&1); td_rc=$?
[ "$td_rc" -ne 0 ] && printf '%s\n' "$td_out" | grep -qF "worktree teardown P1 refused -- nothing was removed:" \
  && printf '%s\n' "$td_out" | grep -qF "ignored, worktree-only files would be deleted" && printf '%s\n' "$td_out" | grep -qF "temp/" \
  && [ -d "$HWT/.sikstack" ] && git -C "$NH" worktree list | grep -qF "$HWT" \
  && ok "paired worktree teardown refuses first on the ignored worktree-only temp/ and removes nothing" \
  || bad "the teardown guard did not refuse (rc=$td_rc) -- $td_out"
td_out=$(nw worktree teardown P1 --discard-ignored 2>&1); td_rc=$?
nested_at=$(printf '%s\n' "$td_out" | grep -n '^removed nested worktree' | head -1 | cut -d: -f1); host_at=$(printf '%s\n' "$td_out" | grep -n '^removed host worktree' | head -1 | cut -d: -f1)
if [ "$td_rc" -eq 0 ] && [ -n "$nested_at" ] && [ -n "$host_at" ] && [ "$nested_at" -lt "$host_at" ] && printf '%s\n' "$td_out" | grep -q "^kept host branch feat/side:" \
    && [ -n "$(git -C "$NH" branch --list feat/side)" ] && [ ! -e "$HWT" ] \
    && ! git -C "$NH" worktree list | grep -qF "$HWT" && ! git -C "$NW" worktree list | grep -qF "$HWT" \
    && ! git -C "$NH" worktree list --porcelain | grep -q '^prunable' && ! git -C "$NW" worktree list --porcelain | grep -q '^prunable' \
    && ! grep -q '"execution"' "$NW/works/phases/active/P1/phase.json" && ! nw worktree status 2>&1 | grep -q '^== P1'; then
  ok "paired worktree teardown --discard-ignored removes the nested worktree before the host worktree and keeps the host branch feat/side; it clears the execution block, so worktree status stops listing P1"
else bad "paired teardown wrong (rc=$td_rc) -- $td_out"; fi
# v86 (§9.4): an explain phase's pair goes detached without --host-branch -- no host branch is made, kept or deleted.
{ nw phase new --phase P2 --name "Explain: probe" --objective "detached host" \
    && printf '\n## Explain\n\n- unit: document\n' >> "$NW/works/phases/active/P2/intent.md"; } >/dev/null 2>&1 || bad "detached pair: could not create the explain phase"
hb_before=$(git -C "$NH" branch --list | wc -l | tr -d ' ')
ps_out=$(nw worktree start P2 2>&1); ps_rc=$?
HWT2=$(printf '%s\n' "$ps_out" | sed -n 's/^host_worktree=//p'); PBR2=$(printf '%s\n' "$ps_out" | sed -n 's/^branch=//p')
if [ "$ps_rc" -eq 0 ] && printf '%s\n' "$ps_out" | grep -q '^host_branch=- (detached host worktree' && [ -d "$HWT2/.sikstack" ] \
    && ! git -C "$HWT2" symbolic-ref -q HEAD >/dev/null 2>&1 && [ "$(git -C "$NH" branch --list | wc -l | tr -d ' ')" = "$hb_before" ] \
    && python3 -c 'import json,sys; e=json.load(open(sys.argv[1]))["execution"]; assert e["host_branch"] is None and e["host_branch_created"] is False, e' "$NW/works/phases/active/P2/phase.json" \
    && nw check --no-rebuild >/dev/null 2>&1; then
  ok "nested worktree start of an explain phase with no --host-branch cuts a detached host worktree: host_branch null, no host branch made, validate passes"
else bad "detached explain pair wrong (rc=$ps_rc) -- $ps_out -- $(nw check --no-rebuild 2>&1 | tail -3)"; fi
PG="$HWT2/.sikstack/works/phases/active/P2/doc/pages"
mkdir -p "$PG" && printf '*\n!.gitignore\n' > "$PG/.gitignore" && printf 'cached\n' > "$PG/p1.html" \
  && git -C "$HWT2/.sikstack" add works/phases/active/P2/doc >/dev/null 2>&1 && git -C "$HWT2/.sikstack" commit -qm "dossier" >/dev/null 2>&1 \
  && git -C "$NW" add -A >/dev/null 2>&1 && { git -C "$NW" commit -qm "default state" >/dev/null 2>&1; git -C "$NW" merge --no-ff -q -m "merge P2" "$PBR2" >/dev/null 2>&1; } \
  || bad "detached pair: could not commit the dossier or merge $PBR2"
td_out=$(nw worktree teardown P2 --discard-ignored 2>&1); td_rc=$?
if [ "$td_rc" -eq 0 ] && printf '%s\n' "$td_out" | grep -q '^no host branch: the host worktree was detached' && printf '%s\n' "$td_out" | grep -q '^deleted 1 ignored' \
    && [ ! -e "$HWT2" ] && [ "$(git -C "$NH" branch --list | wc -l | tr -d ' ')" = "$hb_before" ] \
    && ! git -C "$NH" worktree list | grep -qF "$HWT2" && ! git -C "$NW" worktree list | grep -qF "$HWT2" && nw check --no-rebuild >/dev/null 2>&1; then
  ok "the detached pair's teardown --discard-ignored drops the ignored pages/ and both worktrees and leaves no host branch"
else bad "detached pair teardown wrong (rc=$td_rc) -- $td_out"; fi

# ---------------------------------------------------------------------------
echo "== Test 17: multi-repo host -- init and repo add make the host (the repo registry with per-repo conventions, the repos hidden), phase scope reads each repo on its own, pr check never passes a repo with no body, and a worktree set refuses to tear down what it did not stamp and then retires clean =="
# Identity comes from the environment of one call (mr), never from a git config.
mr() { env GIT_AUTHOR_NAME=smoke GIT_AUTHOR_EMAIL=smoke@example.invalid GIT_COMMITTER_NAME=smoke GIT_COMMITTER_EMAIL=smoke@example.invalid "$@"; }
mr_repo() { mkdir -p "$1" && ( cd "$1" && mr git init -q . && mr git symbolic-ref HEAD refs/heads/main && printf '%s\n' "$2" > "$2.txt" \
  && mr git add -A && mr git commit -qm "feat: $2" ) >/dev/null 2>&1 || bad "multi-repo probe: could not build the $2 repo"; }
# A tree's listing, its non-.git file contents and every repo's HEAD and status in it: a refusal or a dry run leaves it unchanged.
mr_sig() { ( cd "$1" && find . -name .git -prune -print -o -print | LC_ALL=C sort; find . -name .git -prune -o -type f -print0 | LC_ALL=C sort -z | xargs -0 cat; \
  find . -name .git -prune -print | while read -r g; do git -C "$(dirname "$g")" rev-parse HEAD 2>&1; git -C "$(dirname "$g")" status --porcelain 2>&1; done ) | sha_stdin; }
pjget() { python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d = d[k]
print(d)' "$1" "$2"; }
# (a) a multi-repo host the way a user makes one: a folder of repos given its own git repo (one empty commit), then
# `sikstack init` there, `repo add` for each repo and `init` again, which hides the registered repos in the host's exclude.
newtmp MR; MH="$MR/host"; mr_repo "$MH/alpha" alpha; mr_repo "$MH/beta" beta
hw() { ( cd "$MH" && mr python3 "$ENG" "$@" ); }
out=$( { git -C "$MH" init -q && mr git -C "$MH" commit -q --allow-empty -m "chore: start the host history" && mkhost "$MH" \
  && hw repo add alpha && hw repo add beta && ( cd "$MH" && python3 "$ENG" init ); } 2>&1 ); rc=$?
if [ "$rc" -eq 0 ] && [ "$(git -C "$MH" rev-list --count HEAD)" = 1 ] \
    && [ -z "$(git -C "$MH" status --porcelain --untracked-files=all)" ] && grep -qx '/alpha/' "$MH/.git/info/exclude" && grep -qx '/beta/' "$MH/.git/info/exclude" && grep -qx '/.sikstack/' "$MH/.git/info/exclude" \
    && python3 -c 'import json,sys; r = json.load(open(sys.argv[1]))["repos"]; assert [x["name"] for x in r] == ["alpha", "beta"], r; assert all(not (x["commit_convention"] or {}).get("confirmed") for x in r), r' "$MH/.sikstack/.agentic-nested.json" \
    && hw check --no-rebuild >/dev/null 2>&1 && hw next 2>&1 | grep -q "^repo_conventions=.*UNCONFIRMED"; then
  ok "a multi-repo host made by init and repo add: its one empty commit, both repos registered with unconfirmed conventions, and init's second run hides them (and .sikstack/) with a clean host status"
else bad "a multi-repo host was not made by init and repo add (rc=$rc) -- $out / $(git -C "$MH" status --porcelain | head -3)"; fi
# (c) phase scope reads each repo on its own, from the anchor stamped at phase new.
hw phase new --phase P1 --name "Multi" --objective "probe the host" >/dev/null 2>&1 || bad "multi-repo probe: phase new failed"
printf 'one\n' > "$MH/alpha/one.txt" && mr git -C "$MH/alpha" add one.txt >/dev/null 2>&1 && mr git -C "$MH/alpha" commit -qm "feat: one" >/dev/null 2>&1 || bad "multi-repo probe: could not commit in alpha"
sc=$(hw phase scope P1 2>&1); sc_rc=$?; a_head=$(git -C "$MH/alpha" rev-parse --short HEAD)
[ "$sc_rc" -eq 0 ] && printf '%s\n' "$sc" | grep -q "^repo=alpha path=alpha/ .*head=$a_head .*commits=1$" && printf '%s\n' "$sc" | grep -qx '    A alpha/one.txt' \
  && printf '%s\n' "$sc" | grep -q "^repo=beta path=beta/ commits=0 " \
  && ok "phase scope prints one block per repo: alpha holds its commit and file, beta shows no commits" || bad "multi-repo phase scope wrong (rc=$sc_rc) -- $sc"
printf '%s\n' "$sc" | grep -qx 'repo=alpha pathspec=.' && printf '%s\n' "$sc" | grep -qx 'repo=beta pathspec=.' \
  && printf '%s\n' "$sc" | grep -qx "repo=. (host) pathspec=. ':(exclude).sikstack' ':(exclude)alpha' ':(exclude)beta'" \
  && ok "multi-repo phase scope prints one pathspec per repo and the host's, which excludes .sikstack/ and every repo folder" \
  || bad "multi-repo pathspec lines missing or wrong -- $sc"
# (c2) pr check on a multi-repo host never passes a repo with no body: alpha's lines say body=missing and warn; with no
# branch recorded and no --repo nothing is measured, which warns too.
pc_a=$(hw pr check P1 --repo alpha 2>&1); pc_a_rc=$?; pc_n=$(hw pr check P1 2>&1); pc_n_rc=$?
[ "$pc_a_rc" -eq 0 ] && printf '%s\n' "$pc_a" | grep -qx 'repo=alpha pr_check=alpha:main base=main' && printf '%s\n' "$pc_a" | grep -q '^repo=alpha body=missing (topics/pr-body-alpha.md)$' \
  && printf '%s\n' "$pc_a" | grep -qx 'pr_check=warn' && [ "$pc_n_rc" -eq 0 ] && printf '%s\n' "$pc_n" | grep -q '^pr_branches=none recorded' && printf '%s\n' "$pc_n" | grep -qx 'pr_check=warn' \
  && ok "multi-repo pr check: a repo with no topics/pr-body-<repo>.md prints repo=<name> body=missing and pr_check=warn; no recorded branch and no --repo warns too, never pass" \
  || bad "multi-repo pr check missing-body verdict wrong (rc $pc_a_rc/$pc_n_rc) -- $pc_a / $pc_n"
# (d) a worktree set: worktree start --repo cuts a worktree per repo; teardown refuses a dirty repo worktree and a hand-made one it did not stamp, then retires the set.
git -C "$MH/.sikstack" add -A >/dev/null 2>&1 && mr git -C "$MH/.sikstack" commit -qm "chore: install and create the phase" >/dev/null 2>&1 || bad "multi-repo probe: could not commit the nested repo"
ps_out=$(hw worktree start P1 --host-branch hb --repo alpha=feat/a --repo beta=feat/b --repo-base alpha=main --repo-base beta=main 2>&1); ps_rc=$?
PJ="$MH/.sikstack/works/phases/active/P1/phase.json"; WT=$(pjget "$PJ" execution.host_worktree); PB=$(pjget "$PJ" execution.branch)
wl() { git -C "$MH/alpha" worktree list; git -C "$MH/beta" worktree list; git -C "$MH" worktree list; git -C "$MH/.sikstack" worktree list; }
[ "$ps_rc" -eq 0 ] && [ -f "$WT/alpha/.git" ] && [ -f "$WT/beta/.git" ] && [ "$(pjget "$PJ" execution.repos.beta.branch)" = "feat/b" ] \
  && ok "worktree start --repo cuts a worktree per repo inside the host worktree and stamps each in execution.repos" || bad "worktree start --repo did not cut the set (rc=$ps_rc) -- $ps_out"
wl_before=$(wl); printf 'dirty\n' > "$WT/alpha/dirty.txt"
td_out=$(hw worktree teardown P1 2>&1); td_rc=$?
[ "$td_rc" -ne 0 ] && [ "$(wl)" = "$wl_before" ] && [ -f "$WT/alpha/dirty.txt" ] \
  && ok "worktree teardown refuses a repo worktree with uncommitted work and removes nothing" || bad "teardown did not refuse a dirty repo worktree (rc=$td_rc) -- $td_out"
rm -f "$WT/alpha/dirty.txt"
printf '/vendor/\n' >> "$MH/.git/info/exclude"   # hidden from the host worktree's status, so only the stamp can tell it from the set's own
mr git -C "$MH/alpha" worktree add -q --detach "$WT/vendor" >/dev/null 2>&1 && printf 'wip\n' > "$WT/vendor/wip.txt" || bad "multi-repo probe: could not make the hand-made worktree"
wl_before=$(wl); val_out=$(hw check --no-rebuild 2>&1); val_rc=$?; td_out=$(hw worktree teardown P1 --discard-ignored 2>&1); td_rc=$?
[ "$val_rc" -eq 0 ] && printf '%s\n' "$val_out" | grep -q "^warning: .*/vendor" && [ "$td_rc" -ne 0 ] && [ "$(wl)" = "$wl_before" ] && [ -f "$WT/vendor/wip.txt" ] \
  && [ "$(pjget "$PJ" execution.repos.alpha.worktree)" != None ] \
  && ok "a hand-made worktree in the host worktree: validate warns (rc 0), teardown refuses even with --discard-ignored, its uncommitted file and every worktree list untouched" \
  || bad "the hand-made worktree was not warned about and refused (validate rc=$val_rc, teardown rc=$td_rc) -- $val_out $td_out"
{ mr git -C "$MH/alpha" worktree remove --force "$WT/vendor" && printf 'b\n' > "$WT/beta/b2.txt" && mr git -C "$WT/beta" add b2.txt \
  && mr git -C "$WT/beta" commit -qm "feat: beta work" && mr git -C "$WT/.sikstack" commit -q --allow-empty -m "chore(works): slice work" \
  && mr git -C "$MH/.sikstack" merge -q --no-ff -m "merge: the phase" "$PB"; } >/dev/null 2>&1 || bad "multi-repo probe: could not integrate the set"
td_out=$(hw worktree teardown P1 --discard-ignored 2>&1); td_rc=$?
if [ "$td_rc" -eq 0 ] && [ ! -e "$WT" ] && [ -z "$(git -C "$MH/alpha" branch --list feat/a)" ] && [ -n "$(git -C "$MH/beta" branch --list feat/b)" ] \
    && [ "$(git -C "$MH/alpha" worktree list | wc -l | tr -d ' ')" = 1 ] && [ "$(git -C "$MH/beta" worktree list | wc -l | tr -d ' ')" = 1 ] \
    && ! pjget "$PJ" execution >/dev/null 2>&1 && hw check --no-rebuild >/dev/null 2>&1; then
  ok "with the hand-made worktree gone, teardown removes the repo worktrees, clears the execution block, deletes the created branch with no commits and keeps the one with a commit; validate passes"
else bad "the set did not retire cleanly (rc=$td_rc) -- $td_out"; fi
# (d2) a repo added mid-phase, from inside the set, is stamped on the phase branch only; the default stream's worktree status must still list it.
{ hw phase new --phase P2 --name "Mid" --objective "add a repo mid-phase" && git -C "$MH/.sikstack" add -A && mr git -C "$MH/.sikstack" commit -qm "chore: create the second phase" \
  && hw worktree start P2 --host-branch hb2 --repo alpha=feat/a2 --repo-base alpha=main; } >/dev/null 2>&1 || bad "multi-repo probe: could not cut the second set"
PJ2="$MH/.sikstack/works/phases/active/P2/phase.json"; WT2=$(pjget "$PJ2" execution.host_worktree)
add_out=$( cd "$WT2" && mr python3 "$ENG" worktree add-repo P2 --repo beta=feat/b2 --repo-base main 2>&1 ); add_rc=$?
st_out=$(hw worktree status 2>&1); st_rc=$?
[ "$add_rc" -eq 0 ] && ! pjget "$PJ2" execution.repos.beta >/dev/null 2>&1 && [ "$st_rc" -eq 0 ] && printf '%s\n' "$st_out" | grep -q '^  source=branch phase/P2' \
  && printf '%s\n' "$st_out" | grep -q '^  repo beta: branch=feat/b2 (created) ' \
  && ok "a repo added mid-phase (stamped on the phase branch only) is listed by the default stream's worktree status, which reads the set's repos from the branch it reports" \
  || bad "the default stream's worktree status lost the repo added mid-phase (add rc=$add_rc, status rc=$st_rc) -- $add_out $st_out"

# ---------------------------------------------------------------------------
echo "== Test 19: P51 PR rule v1 -- the pr block and its commands, pr check's size/budgets/leaks/headings, the pass guard, validate and next, the drafts opening with no stop (a REVIEW stop halts a run), the pr skill and pr-reader, the team-rule banner, the symlinked skills exclude, the root linguist lines, the _is_ancestor regression; zero GitHub writes =="
# Tiny and core only. Every remote is local (a bare origin) and gh is a stub on PATH: nothing reaches GitHub.
pr_t0=$(date +%s)
newtmp PRW; PRR="$PRW/ws"
mkhost "$PRR" > "$PRW/install.txt" 2>&1 || bad "pr probe: the fresh install failed"
PRG="$PRW/gh"; mkdir -p "$PRG"; printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/gh.log"\necho "stub: no such PR" >&2; exit 1\n' "$PRG" > "$PRG/gh"; chmod +x "$PRG/gh"
pw() { ( cd "$PRR" && PATH="$PRG:$PATH" python3 "$(wf_entry "$1")" "$@" ); }
pgit() { git -C "$PRR" "$@"; }
pj() { python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d = d.get(k) if isinstance(d, dict) else (d[int(k)] if isinstance(d, list) and len(d) > int(k) else None)
print(json.dumps(d, sort_keys=True))' "$PRR/.sikstack/works/phases/active/$1/phase.json" "$2"; }
pgit config user.email smoke@example.invalid; pgit config user.name smoke
mkdir -p "$PRR/src" "$PRR/tests" "$PRR/gen"; printf 'gen/** linguist-generated=true\n' >> "$PRR/.gitattributes"
seq 1 50 | sed 's/^/old /' > "$PRR/src/old.py"; printf 'a\nb\nc\n' > "$PRR/src/app.py"; printf '{}\n' > "$PRR/package-lock.json"
( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m baseline && cd .. && git add -A && git commit -q --allow-empty -m baseline ) >/dev/null 2>&1 || bad "pr probe: baseline commit failed"
# (1) phase new stamps the empty pr block.
pw phase new --phase P1 --name "PR probe" --objective "toy" >/dev/null 2>&1 && ( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m p1 && cd .. && git add -A && git commit -q --allow-empty -m p1 ) >/dev/null 2>&1
[ "$(pj P1 pr)" = '{"branches": [], "waived": null}' ] && ok "phase new stamps pr = {branches: [], waived: null}" || bad "phase new pr block wrong: $(pj P1 pr)"
# (2) pr branch: three refusals leave phase.json byte-identical; then it cuts and records the branch.
pgit branch feat/other main
h0=$(sha "$PRR/.sikstack/works/phases/active/P1/phase.json")
pw pr branch P1 --name feat/other > "$PRW/r1.txt" 2>&1; r1=$?
pw pr branch P1 --name main > "$PRW/r2.txt" 2>&1; r2=$?
echo dirty >> "$PRR/src/app.py"; pw pr branch P1 --name feat/b > "$PRW/r3.txt" 2>&1; r3=$?; pgit checkout -q -- src/app.py
h1=$(sha "$PRR/.sikstack/works/phases/active/P1/phase.json")
b_out=$(pw pr branch P1 --name feat/a 2>&1); b_rc=$?
[ "$r1" -eq 1 ] && grep -q "already exists .* is not checked out there" "$PRW/r1.txt" && [ "$r2" -eq 1 ] && grep -q "that is the base or default branch itself" "$PRW/r2.txt" \
  && [ "$r3" -eq 1 ] && grep -q "uncommitted tracked changes a switch would carry onto feat/b: src/app.py" "$PRW/r3.txt" && [ "$h0" = "$h1" ] \
  && [ "$b_rc" -eq 0 ] && printf '%s\n' "$b_out" | grep -qx 'pr_branch=host:feat/a base=main' && [ "$(pgit branch --show-current)" = feat/a ] \
  && [ "$(pj P1 pr.branches.0.branch)" = '"feat/a"' ] && [ "$(pj P1 pr.branches.0.url)" = null ] \
  && ok "pr branch refuses an existing unchecked-out branch, the default branch and a dirty tracked tree (phase.json byte-identical), then cuts feat/a from main and records it" \
  || bad "pr branch wrong (rc $r1/$r2/$r3/$b_rc, sha $h0 -> $h1) -- $(cat "$PRW/r1.txt" "$PRW/r2.txt" "$PRW/r3.txt") / $b_out"
# (3) pr check size: a generated file, a lockfile, a deletion and a binary are excluded; test lines count.
seq 1 30 > "$PRR/gen/out.txt"; printf '{"a":1}\n' > "$PRR/package-lock.json"; pgit rm -q src/old.py; printf '\000\001\002bin' > "$PRR/src/logo.bin"
seq 1 20 | sed 's/^/assert /' > "$PRR/tests/test_app.py"; printf 'd\ne\n' >> "$PRR/src/app.py"
( cd "$PRR" && git add gen src tests package-lock.json && git commit -qm "feat: toy" ) >/dev/null 2>&1 || bad "pr probe: product commit failed"
c_out=$(pw pr check P1 2>&1); c_rc=$?
[ "$c_rc" -eq 0 ] && printf '%s\n' "$c_out" | grep -qx 'size=22 size_status=info' \
  && printf '%s\n' "$c_out" | grep -qx 'size_excluded=4 files (generated 1, lockfiles 1, deleted 1, binary 1; counted 2 files)' \
  && printf '%s\n' "$c_out" | grep -qx 'pr_check=host:feat/a base=main' && printf '%s\n' "$c_out" | grep -q '^body=missing (topics/pr-body.md)$' \
  && printf '%s\n' "$c_out" | grep -qx 'pr_check=warn' \
  && ok "pr check size excludes the generated file, the lockfile, the deletion and the binary (size_excluded=4) and counts the test lines; the label is host:, and a missing default body is body=missing and pr_check=warn (exit 0), never pass" || bad "pr check size or missing-body verdict wrong (rc=$c_rc) -- $c_out"
# (4)(5) bodies: the three budgets, the leaks, the warn, the passes, and the headings (default order, then a team template).
python3 - "$PRW" <<'PY'
import sys
d = sys.argv[1]
def body(review="Check the parser.", changed="The parser reads two more lines.", why="It needed them.", extra="", order=None):
    secs = {"Summary": "Adds two lines to the toy app.", "Review": review, "What is changed": changed, "Why": why, "Related issue": "None."}
    return "".join(f"## {h}\n\n{secs[h]}\n\n" for h in (order or list(secs))) + extra
bodies = {"ok": body(), "first": body(review="word " * 320), "visible": body(changed="word " * 720),
          "whole": body(extra="<!--\n" + "word " * 1300 + "\n-->\n"), "phase": body(why="It was planned in P51."),
          "path": body(why="See workflow/docs/current/qa.md."), "warn": body(why="One slice was enough."),
          "pass": body(why="The S3 bucket p95 latency dropped."),
          "order": body(order=["Summary", "Review", "Why", "What is changed", "Related issue"]),
          "missing": body(order=["Summary", "Review", "What is changed", "Why"])}
for k, v in bodies.items():
    open(f"{d}/body-{k}.md", "w").write(v)
PY
pcb() { pw pr check P1 --body "$PRW/body-$1.md" > "$PRW/check-$1.txt" 2>&1; printf '%s' "$?"; }
pcl() { grep -qx "$2" "$PRW/check-$1.txt"; }
if [ "$(pcb ok)" = 0 ] && pcl ok 'pr_check=pass' && pcl ok 'headings=ok' && pcl ok 'leaks=none' \
    && [ "$(pcb first)" = 1 ] && pcl first 'first_screen=[0-9]*/1500 over' && [ "$(pcb visible)" = 1 ] && pcl visible 'visible=[0-9]*/3500 over' && pcl visible 'first_screen=[0-9]*/1500 ok' \
    && [ "$(pcb whole)" = 1 ] && pcl whole 'whole=[0-9]*/6000 over' && pcl whole 'visible=[0-9]*/3500 ok' \
    && [ "$(pcb phase)" = 1 ] && grep -q '^leak=phase_id:P51 ' "$PRW/check-phase.txt" && [ "$(pcb path)" = 1 ] && grep -q '^leak=workflow_path:workflow/ ' "$PRW/check-path.txt" \
    && [ "$(pcb warn)" = 0 ] && grep -q '^leak_warn=slice x1 ' "$PRW/check-warn.txt" && pcl warn 'pr_check=warn' \
    && [ "$(pcb pass)" = 0 ] && pcl pass 'leaks=none' && pcl pass 'pr_check=pass' \
    && [ "$(pcb order)" = 1 ] && pcl order 'headings=order:Why' && [ "$(pcb missing)" = 1 ] && pcl missing 'headings=missing:Related issue'; then
  ok "pr check bodies: each of the three budgets fails over and passes within; P51 and workflow/ fail; 'slice' alone warns (exit 0); 'S3 bucket' and 'p95' pass; out-of-order and missing headings fail against the default order"
else bad "pr check body checks wrong -- $(for k in ok first visible whole phase path warn pass order missing; do printf '[%s] %s ' "$k" "$(grep -E 'first_screen|visible=|whole=|leak|headings|pr_check=' "$PRW/check-$k.txt" | tr '\n' ' ')"; done)"; fi
mkdir -p "$PRR/.github"; printf '## Summary\n\n## What is changed\n\n## Why\n\n## Related issue\n' > "$PRR/.github/pull_request_template.md"
if [ "$(pcb ok)" = 0 ] && pcl ok 'template=.github/pull_request_template.md' && [ "$(pcb order)" = 1 ] && pcl order 'headings=order:Why' \
    && [ "$(pcb missing)" = 1 ] && pcl missing 'headings=missing:Related issue' && pcl missing 'template=.github/pull_request_template.md'; then
  ok "pr check headings: out-of-order and missing headings fail against the team's template too, and a body keeping its order passes"
else bad "pr check template headings wrong -- $(cat "$PRW/check-ok.txt" "$PRW/check-order.txt" "$PRW/check-missing.txt")"; fi
rm -f "$PRR/.github/pull_request_template.md"
# (F2) a missing --body file fails; by hand (no phase) a clean --body passes against the default branch; no phase and no
# --body is refused in one line naming both forms, writing nothing. Size has no default limit (D4 amended): a big branch with a
# clean body is info and passes; only a team's --limit warns (over), on either route; a 0 or non-integer limit is refused.
pw pr check P1 --body "$PRW/no-such-body.md" > "$PRW/check-nobody.txt" 2>&1; a4=$?
pw pr check --body "$PRW/body-ok.md" > "$PRW/check-hand.txt" 2>&1; a6=$?
e0=$(sha "$PRR/.sikstack/works/events.jsonl"); pw pr check > "$PRW/check-none.txt" 2>&1; a7=$?; e1=$(sha "$PRR/.sikstack/works/events.jsonl")
{ pgit switch -qc feat/big && seq 1 1100 > "$PRR/src/big.py" && pgit add src/big.py && pgit commit -qm "feat: big" && pgit switch -q feat/a; } >/dev/null 2>&1
pw pr check --body "$PRW/body-ok.md" --branch feat/big > "$PRW/check-big.txt" 2>&1; a8=$?
pw pr check --body "$PRW/body-ok.md" --branch feat/big --limit 400 > "$PRW/check-lim.txt" 2>&1; a9=$?
pw pr check P1 --body "$PRW/body-ok.md" --limit 400 > "$PRW/check-limok.txt" 2>&1; a10=$?
pw pr check P1 --body "$PRW/body-ok.md" --limit 10 > "$PRW/check-limph.txt" 2>&1; a11=$?
pw pr check P1 --body "$PRW/body-ok.md" --limit 0 > "$PRW/check-lim0.txt" 2>&1; a12=$?
pw pr check --body "$PRW/body-ok.md" --limit 4k > "$PRW/check-limx.txt" 2>&1; a13=$?
if [ "$a4" = 1 ] && pcl nobody "body=missing ($PRW/no-such-body.md)" && pcl nobody 'pr_check=fail' \
    && [ "$a6" = 0 ] && pcl hand 'pr_check=host:feat/a base=main' && pcl hand 'note=by hand (no phase) -- measured feat/a against the default branch main' \
    && pcl hand 'size=22 size_status=info' && pcl hand 'headings=ok' && pcl hand 'pr_check=pass' \
    && [ "$a7" -ne 0 ] && [ "$(wc -l < "$PRW/check-none.txt" | tr -d ' ')" = 1 ] && grep -q 'pr check <P>' "$PRW/check-none.txt" && grep -q 'pr check --body <file>' "$PRW/check-none.txt" && [ "$e0" = "$e1" ] \
    && [ "$a8" = 0 ] && grep -q '^size=1[0-9][0-9][0-9] size_status=info$' "$PRW/check-big.txt" && pcl big 'pr_check=pass' && ! grep -qE '^size_over=|target=|flag=' "$PRW/check-big.txt" \
    && [ "$a9" = 0 ] && grep -q '^size=1[0-9][0-9][0-9] limit=400 size_status=over$' "$PRW/check-lim.txt" && grep -q '^size_over=[0-9]* changed lines over the team' "$PRW/check-lim.txt" && pcl lim 'pr_check=warn' \
    && [ "$a10" = 0 ] && pcl limok 'size=22 limit=400 size_status=ok' && pcl limok 'pr_check=pass' \
    && [ "$a11" = 0 ] && pcl limph 'size=22 limit=10 size_status=over' && pcl limph 'size_over=12 changed lines over the team'"'"'s limit of 10 -- split this branch (a stack or a series: the pr skill'"'"'s reference/split.md) or name the exception in ## Review' && pcl limph 'pr_check=warn' \
    && [ "$a12" = 1 ] && [ "$(wc -l < "$PRW/check-lim0.txt" | tr -d ' ')" = 1 ] && grep -q '^pr check --limit 0: refused' "$PRW/check-lim0.txt" \
    && [ "$a13" = 1 ] && [ "$(wc -l < "$PRW/check-limx.txt" | tr -d ' ')" = 1 ] && grep -q '^pr check --limit 4k: refused' "$PRW/check-limx.txt"; then
  ok "pr check: a missing --body file fails (exit 1); by hand with no phase, a clean --body on feat/a passes against the default branch main; no phase and no --body is refused in one line naming both forms, writing nothing; with no team limit a 1,000-line branch is size_status=info and passes; a team --limit warns over it (by hand and in a phase, with size_over=) and is ok within it; --limit 0 and 4k are refused in one line"
else bad "pr check missing --body / by-hand route / size limit wrong (rc $a4/$a6/$a7/$a8/$a9/$a10/$a11/$a12/$a13) -- $(cat "$PRW/check-nobody.txt" "$PRW/check-hand.txt" "$PRW/check-none.txt" "$PRW/check-big.txt" "$PRW/check-lim.txt" "$PRW/check-limok.txt" "$PRW/check-limph.txt" "$PRW/check-lim0.txt" "$PRW/check-limx.txt")"; fi
# (6a) the drafts open when the review passes, with no stop (F3): while the REVIEW runs with a branch unopened, next prints
# pr_draft=due; while the REVIEW is pending (a decision on a waived gate, or an open failure's operator-action), next
# prints no pr_draft=due (D120, P52).
{ pw slice finish P1.DECOMP --outcome cut && pw gate P1 waive --note toy && pw slice start P1.REVIEW \
  && : > "$PRR/.sikstack/works/phases/active/P1/slices/P1.REVIEW/result.md"; } >/dev/null 2>&1 \
  || bad "pr probe: could not bring P1 to its review"
P1D="$PRR/.sikstack/works/phases/active/P1"; gsig() { cat "$P1D/phase.json" "$PRR/.sikstack/works/events.jsonl" "$P1D/slices/P1.REVIEW/slice.json" | sha_stdin; }
plain=$(pw next 2>&1)
if printf '%s\n' "$plain" | grep -q '^pr_draft=due -- when the review would pass: open the draft(s) (pr skill: Open the drafts' \
    && printf '%s\n' "$plain" | grep -qx 'pr_branch=host:feat/a base=main url=none'; then
  ok "while a waived gate's REVIEW runs with a branch unopened, next prints pr_branch= and pr_draft=due"
else bad "the drafts' due line wrong -- next: $plain"; fi

pw slice status P1.REVIEW pending --stop-kind decision --on-words "an answer resumes it" >/dev/null 2>&1; nx_d=$(pw next 2>&1)
pw slice status P1.REVIEW in_progress >/dev/null 2>&1
pw slice status P1.REVIEW pending --stop-kind operator-action --on-words "gh auth login resumes the open" >/dev/null 2>&1; nx_o=$(pw next 2>&1)
pw slice status P1.REVIEW in_progress >/dev/null 2>&1
u_out=$(pw pr record P1 --url https://github.com/example/toy/pull/1 2>&1); nx_u=$(pw next 2>&1)
if printf '%s\n' "$nx_d" | grep -qx 'waiting_on_operator=P1.REVIEW' && ! printf '%s\n' "$nx_d" | grep -q '^pr_draft=' \
    && printf '%s\n' "$nx_o" | grep -qx 'waiting_on_operator=P1.REVIEW' && ! printf '%s\n' "$nx_o" | grep -q '^pr_draft=' \
    && printf '%s\n' "$nx_u" | grep -qx 'pr_branch=host:feat/a base=main url=https://github.com/example/toy/pull/1' && ! printf '%s\n' "$nx_u" | grep -q '^pr_draft=\|^pr_push='; then
  ok "a REVIEW stop on a waived gate (decision, or an open failure's operator-action) is a stop next waits on, and next prints no pr_draft=due while the REVIEW is pending (D120; it prints while in_progress and in_review); once pr record --url ran, next prints the url and no due line"
else bad "REVIEW stop / url wrong -- decision: $nx_d / operator-action: $nx_o / url: $nx_u"; fi
{ pw slice status P1.REVIEW in_progress && pw review P1 --verdict pass; } > "$PRW/pass1.txt" 2>&1 \
  && grep -q '^phase P1 review: pass' "$PRW/pass1.txt" && ! grep -q '^advice: pr_draft=due' "$PRW/pass1.txt" && printf '%s\n' "$u_out" | grep -q '^advice: the draft.s state was not read (gh pr failed: stub: no such PR)' \
  && ok "with the draft's URL recorded the pass records with no pr_draft advice; gh answering no PR, pr record --url records the URL with an advice line" || bad "pass after pr record --url wrong -- $u_out / $(cat "$PRW/pass1.txt")"
( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m "p1 done" && cd .. && git add -A && git commit -q --allow-empty -m "p1 done" ) >/dev/null 2>&1
# (6b) the draft PR before a pass is advice (v102; v101 refused both): a recorded branch unopened, and an empty block with
# committed product files, each pass with one advice: pr_draft=due line; pr branch records the checked-out branch.
pw phase new --phase P2 --name "PR probe 2" --objective "toy" >/dev/null 2>&1; ( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m p2 && cd .. && git add -A && git commit -q --allow-empty -m p2 && git switch -qc feat/c \
  && echo more >> src/app.py && git add src && git commit -qm "feat: more" ) >/dev/null 2>&1
{ pw slice finish P2.DECOMP --outcome cut && pw gate P2 waive --note toy && pw slice start P2.REVIEW && : > "$PRR/.sikstack/works/phases/active/P2/slices/P2.REVIEW/result.md"; } >/dev/null 2>&1
k_out=$(pw pr branch P2 --name feat/c 2>&1); pw slice status P2.REVIEW in_review >/dev/null 2>&1; nx2=$(pw next 2>&1)
e_out=$(pw review P2 --verdict pass 2>&1); e_rc=$?
( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m "p2 done" && cd .. && git add -A && git commit -q --allow-empty -m "p2 done" ) >/dev/null 2>&1
pw phase new --phase P5 --name "PR probe 5" --objective "toy" >/dev/null 2>&1; ( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m p5 && cd .. && git add -A && git commit -q --allow-empty -m p5 \
  && echo five >> src/app.py && git add src && git commit -qm "feat: five" ) >/dev/null 2>&1
{ pw slice finish P5.DECOMP --outcome cut && pw gate P5 waive --note toy && pw slice start P5.REVIEW && : > "$PRR/.sikstack/works/phases/active/P5/slices/P5.REVIEW/result.md"; } >/dev/null 2>&1
f_out=$(pw review P5 --verdict pass 2>&1); f_rc=$?
if printf '%s\n' "$k_out" | grep -q '^pr branch: feat/c recorded (already checked out)' && printf '%s\n' "$nx2" | grep -q '^pr_draft=due ' \
    && [ "$e_rc" -eq 0 ] && printf '%s\n' "$e_out" | grep -q '^phase P2 review: pass' && printf '%s\n' "$e_out" | grep -q '^advice: pr_draft=due -- host:feat/c (base main) has no draft PR: the draft opens when the review passes (pr skill: Open the drafts)' \
    && [ "$f_rc" -eq 0 ] && printf '%s\n' "$f_out" | grep -q '^phase P5 review: pass' && printf '%s\n' "$f_out" | grep -q '^advice: pr_draft=due -- phase P5 changed 1 product file(s) (phase scope P5) but records no PR branch'; then
  ok "the draft PR before a pass is advice: pr branch records a checked-out branch and next prints pr_draft=due (REVIEW in_review); the pass with that branch unopened, and a pass with an empty block over committed product files, each record with one advice: pr_draft=due line"
else bad "the pr_draft advice at a pass wrong (rc $e_rc/$f_rc) -- $k_out / $nx2 / $e_out / $f_out"; fi
( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m "p5 done" && cd .. && git add -A && git commit -q --allow-empty -m "p5 done" ) >/dev/null 2>&1
# (6c) an uncleared required gate still refuses with the PR waived; (6d) a phase with
# no pr block (an older phase) passes as before and prints no pr line.
{ pw phase new --phase P3 --name "PR probe 3" --objective "toy" && pw slice finish P3.DECOMP --outcome cut && pw gate P3 require \
  && pw slice start P3.REVIEW && : > "$PRR/.sikstack/works/phases/active/P3/slices/P3.REVIEW/result.md" && pw pr record P3 --waive --note "toy"; } >/dev/null 2>&1
q_out=$(pw review P3 --verdict pass 2>&1); q_rc=$?; nx3=$(pw next 2>&1)
pw gate P3 open --walkthrough "probe" >/dev/null 2>&1
[ "$q_rc" -ne 0 ] && printf '%s\n' "$q_out" | grep -q 'gate P3 open --walkthrough' && printf '%s\n' "$nx3" | grep -qx 'pr_waived=toy' \
  && ok "an uncleared required acceptance gate still refuses the pass with the PR waived (next prints pr_waived=)" || bad "required gate with a waived PR wrong (rc=$q_rc) -- $q_out / $nx3"
w_out=$( { pw gate P3 clear --words accept && pw review P3 --verdict pass; } 2>&1 ); w_rc=$?
[ "$w_rc" -eq 0 ] && printf '%s\n' "$w_out" | grep -q '^pr: waived (toy) -- pass recorded without a draft PR' && ! printf '%s\n' "$w_out" | grep -q '^advice: pr_draft' \
  && ok "cleared with words, the waived PR's pass records with its pr: waived line and no pr_draft advice" || bad "the waived pass wrong (rc $w_rc) -- $w_out"
{ pw phase new --phase P4 --name "Old phase" --objective "toy" && python3 - "$PRR/.sikstack/works/phases/active/P4/phase.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d.pop("pr"); json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
} >/dev/null 2>&1
( cd "$PRR/.sikstack" && git add -A && git commit -q --allow-empty -m p4 && cd .. && git add -A && git commit -q --allow-empty -m p4 && echo again >> src/app.py && git add src && git commit -qm "feat: again" ) >/dev/null 2>&1
{ pw slice finish P4.DECOMP --outcome cut && pw gate P4 waive --note toy && pw slice start P4.REVIEW && : > "$PRR/.sikstack/works/phases/active/P4/slices/P4.REVIEW/result.md"; } >/dev/null 2>&1
nx4=$(pw next 2>&1); o_out=$(pw review P4 --verdict pass 2>&1); o_rc=$?
[ "$o_rc" -eq 0 ] && ! printf '%s\n' "$nx4" | grep '^pr_' | grep -qv '^pr_open=P1 ' && ! printf '%s\n' "$o_out" | grep -q '^pr' \
  && ok "a phase with no pr block (created before P51) passes as before, and next prints no pr line for it (P52: only the other phase's pr_open= line)" || bad "an older phase changed (rc=$o_rc) -- $nx4 / $o_out"
# (7) validate flags a malformed pr block (an unknown key, a duplicate pair, a bad URL, a repo at root) and a malformed pr_rules.
cp "$P1D/phase.json" "$PRW/p1.json"
pr_bad() { python3 - "$P1D/phase.json" "$1" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); b = d["pr"]; e = b["branches"][0]
kind = sys.argv[2]
if kind == "key": b["extra"] = 1
elif kind == "dup": b["branches"].append(dict(e))
elif kind == "url": e["url"] = "ftp://example/x"
elif kind == "repo": e["repo"] = "nosuch"
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
pw check --no-rebuild > "$PRW/val-$1.txt" 2>&1; v=$?; cp "$PRW/p1.json" "$P1D/phase.json"; printf '%s' "$v"; }
vk=$(pr_bad key); vd=$(pr_bad dup); vu=$(pr_bad url); vr=$(pr_bad repo)
PRM="$PRR/.sikstack/.agentic-nested.json"; cp "$PRM" "$PRW/marker.json"   # nested: the rules live in the marker's pr_rules key
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["pr_rules"]={"decided": [{"rule": "x"}]}; json.dump(d, open(sys.argv[1], "w"), indent=2)' "$PRM"
pw check --no-rebuild > "$PRW/val-rules.txt" 2>&1; vp=$?; cp "$PRW/marker.json" "$PRM"
if [ "$vk" != 0 ] && [ "$vd" != 0 ] && [ "$vu" != 0 ] && [ "$vr" != 0 ] && [ "$vp" -ne 0 ] && grep -q 'pr: unknown field(s) extra' "$PRW/val-key.txt" \
    && grep -q 'host:feat/a is recorded twice' "$PRW/val-dup.txt" && grep -q "url 'ftp://example/x' must be null or an http(s) URL" "$PRW/val-url.txt" \
    && grep -q "repo 'nosuch': this install has no repos registry" "$PRW/val-repo.txt" && grep -q '.agentic-nested.json: pr_rules.decided\[0\]: missing field' "$PRW/val-rules.txt" && pw check --no-rebuild >/dev/null 2>&1; then
  ok "validate flags a malformed pr block (unknown key, duplicate pair, non-http(s) URL, a repo with no registry) and a malformed pr_rules, and passes once restored"
else bad "validate missed a malformed pr block or pr_rules (rc $vk/$vd/$vu/$vr/$vp) -- $(for k in key dup url repo rules; do printf '[%s] %s ' "$k" "$(grep -i 'pr' "$PRW/val-$k.txt" | head -2 | tr '\n' ' ')"; done)"; fi
# (8 stub) the pr skill's two push commands, taken from its close checklist (reference/close.md), run against a local bare origin and a stub gh:
# a --draft create with --body-file; a stub draft refusal is exactly one create call and a stop for the operator's plain|waive
# (reference/open.md; never an automatic retry), and only on plain the same create runs without --draft and with no --reviewer.
newtmp GHS; git init -q --bare "$GHS/origin.git"; pgit remote add origin "$GHS/origin.git"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/gh.log"\ncase "$*" in *--draft*) [ -n "${GH_STUB_REFUSE_DRAFT:-}" ] && { echo "Draft pull requests are not supported in this repository" >&2; exit 1; };; esac\necho https://github.com/example/toy/pull/9\n' "$GHS" > "$GHS/gh"; chmod +x "$GHS/gh"
pr_cmds=$(python3 - "$PLUGIN/skills/pr/reference/close.md" <<'PY'
import re, sys
t = open(sys.argv[1]).read().split("## Open the drafts, when the review passes", 1)[1]
push = re.search(r"^1\. `(git push [^`]+)`", t, re.M).group(1); create = re.search(r"^2\. `(gh pr create [^`]+)`", t, re.M).group(1)
for c in (push, create):
    print(c.replace("<b>", "feat/c").replace("<base>", "main").replace('"<title>"', '"Toy change"').replace("<body>", "BODY"))
PY
)
pr_gitpush=$(printf '%s\n' "$pr_cmds" | sed -n 1p); pr_create=$(printf '%s\n' "$pr_cmds" | sed -n 2p | sed "s|BODY|$PRW/body-ok.md|")
( cd "$PRR" && eval "$pr_gitpush" ) >/dev/null 2>&1; s_push=$?
( cd "$PRR" && export PATH="$GHS:$PATH" && eval "$pr_create" ) >/dev/null 2>&1; s_create=$?
( cd "$PRR" && export PATH="$GHS:$PATH" GH_STUB_REFUSE_DRAFT=1 && eval "$pr_create" ) >/dev/null 2>&1; s_refused=$?; n_refused=$(wc -l < "$GHS/gh.log" | tr -d ' ')
( cd "$PRR" && export PATH="$GHS:$PATH" GH_STUB_REFUSE_DRAFT=1 && eval "$(printf '%s' "$pr_create" | sed 's/ --draft//')" ) >/dev/null 2>&1; s_plain=$?
if [ "$s_push" -eq 0 ] && git -C "$GHS/origin.git" rev-parse --verify --quiet refs/heads/feat/c >/dev/null && [ "$s_create" -eq 0 ] && [ "$s_refused" -ne 0 ] && [ "$n_refused" = 2 ] && [ "$s_plain" -eq 0 ] \
    && [ "$(sed -n 1p "$GHS/gh.log")" = "pr create --draft --base main --head feat/c --title Toy change --body-file $PRW/body-ok.md" ] \
    && [ "$(wc -l < "$GHS/gh.log" | tr -d ' ')" = 3 ] && sed -n 3p "$GHS/gh.log" | grep -q -- '--body-file' && ! sed -n 3p "$GHS/gh.log" | grep -q -- '--draft' && ! grep -q -- '--reviewer' "$GHS/gh.log" \
    && python3 - "$PLUGIN/skills/pr" <<'PY'
import sys
from pathlib import Path
d = Path(sys.argv[1]); core = (d / "SKILL.md").read_text(); ref = (d / "reference/open.md").read_text(); flat = lambda s: " ".join(s.split())
for t in (core, ref): assert "retry **once**" not in t and "retries once" not in t
for s in ("**If GitHub refuses the draft**", "never retry it as a plain PR, which notifies people: stop for the operator's `plain` or `waive` (`reference/open.md`)."): assert s in core, s
for s in ("Set the `REVIEW` slice `pending --stop-kind decision --on-words \"plain opens it as a plain PR (ready for review at once: it requests code-owner reviews and notifies watchers; no reviewers are requested); waive records pr record --waive and the pass\"`",
          "attempt no second one before the operator's word", "**`plain`:** the same `gh pr create` without `--draft`, and no `--reviewer`.",
          "**`waive`:** `sikstack pr record <P> --waive --note", "Drafts already opened stay open. On `plain`, the open continues bottom-up from the refused one"):
    assert flat(s) in flat(ref), s
PY
then
  ok "the pr skill's push commands push to the (local) origin and create a --draft PR with --body-file on a stub gh; a stub draft refusal is one create call and a stop for plain|waive (no automatic retry); plain creates without --draft and no --reviewer"
else bad "pr skill push commands or refused-draft stop wrong (push $s_push, create $s_create, refused $s_refused/$n_refused, plain $s_plain) -- $pr_cmds / $(cat "$GHS/gh.log" 2>/dev/null)"; fi
# (S7) the pr skill: its name, an allowed-tools list with no remote write and no recording command, its two references, its core size.
python3 - "$PLUGIN/skills/pr" <<'PY' && ok "the pr skill: name: pr, no git push / gh pr create|comment|edit|ready|merge / pr record / pr branch / pr sync / --record / bare Bash in allowed-tools (gh pr checks and the bare pr team read allowed), its core names exactly reference/body.md, close.md, open.md, reopen.md, split.md and stack.md (all shipped), core <= 8,192 B" || bad "the pr skill's frontmatter, references or core size changed"
import re, sys
from pathlib import Path
d = Path(sys.argv[1]); core = (d / "SKILL.md").read_bytes(); text = core.decode()
fm = text.split("---\n", 2)[1]
assert re.search(r"^name: pr$", fm, re.M)
tools = re.search(r"^allowed-tools: (.*)$", fm, re.M).group(1)
for gone in ("git push", "gh pr create", "gh pr comment", "gh pr edit", "gh pr ready", "gh pr merge", "pr record", "pr branch", "pr sync", "--record"):
    assert gone not in tools, gone
tl = [t.strip() for t in tools.split(",")]
assert "Bash" not in tl, "bare Bash"
assert "Bash(gh pr checks:*)" in tl and "Bash(sikstack pr team)" in tl, tl
assert set(re.findall(r"`reference/([\w.-]+\.md)`", text)) == {"body.md", "close.md", "open.md", "reopen.md", "split.md", "stack.md"} == {p.name for p in (d / "reference").glob("*.md")}
assert len(core) <= 8192, len(core)
PY
# (S8) pr-reader: the reader row's dispatch lines; the plugin ships the agent.
r_out=$(pw route --reader 2>&1)
printf '%s\n' "$r_out" | grep -qx 'subagent_type=sikstack:pr-reader' && printf '%s\n' "$r_out" | grep -qx 'model=opus' && printf '%s\n' "$r_out" | grep -qx 'effort=high' \
  && [ -f "$PLUGIN/agents/pr-reader.md" ] && grep -qx 'name: pr-reader' "$PLUGIN/agents/pr-reader.md" \
  && ok "route --reader prints subagent_type=pr-reader, model=opus and effort=high, and the plugin ships agents/pr-reader.md" || bad "pr-reader route or fresh install wrong -- $r_out"
# code-reader: the code row's dispatch lines; the agent installs fresh.
c_out=$(pw route --code 2>&1)
printf '%s\n' "$c_out" | grep -qx 'route=code' && printf '%s\n' "$c_out" | grep -qx 'subagent_type=sikstack:code-reader' && printf '%s\n' "$c_out" | grep -qx 'model=opus' && printf '%s\n' "$c_out" | grep -qx 'effort=high' \
  && [ -f "$PLUGIN/agents/code-reader.md" ] && grep -qx 'name: code-reader' "$PLUGIN/agents/code-reader.md" \
  && ok "route --code prints route=code, subagent_type=code-reader, model=opus and effort=high, and the plugin ships agents/code-reader.md" || bad "code-reader route or fresh install wrong -- $c_out"
# A bare nested host for the regression below (the installer's team-rule banners were cut with it).
newtmp PRH; { mkdir -p "$PRH/bare" && echo hi > "$PRH/bare/README.md" && git -C "$PRH/bare" init -q && git -C "$PRH/bare" add -A && git -C "$PRH/bare" commit -qm "chore: init" && mkhost "$PRH/bare"; } >/dev/null 2>&1
# (9) the regression S6 fixed: a nested phase whose host branch left the default branch (merge-base != anchor != HEAD) gets a
# phase scope and a passing review, no TypeError (a duplicate _is_ancestor shadowed P40's); no top-level def is defined twice.
BH="$PRH/bare"; bw() { ( cd "$BH" && PATH="$PRG:$PATH" python3 "$ENG" "$@" ); }
( cd "$BH" && git switch -qc feat/toy && echo b > b.txt && git add b.txt && git commit -qm "feat: b" ) >/dev/null 2>&1
bw phase new --phase P1 --name toy --objective toy >/dev/null 2>&1; ( cd "$BH" && echo c > c.txt && git add c.txt && git commit -qm "feat: c" ) >/dev/null 2>&1
s_out=$(bw phase scope P1 2>&1); s_rc=$?
{ bw slice finish P1.DECOMP --outcome cut && bw gate P1 waive --note toy && bw slice start P1.REVIEW && : > "$BH/.sikstack/works/phases/active/P1/slices/P1.REVIEW/result.md" \
  && bw pr branch P1 --name feat/toy && bw pr record P1 --url https://github.com/example/toy/pull/2; } >/dev/null 2>&1
v_out=$(bw review P1 --verdict pass 2>&1); v_rc=$?
if [ "$s_rc" -eq 0 ] && printf '%s\n' "$s_out" | grep -q '^product_files=1 ' && [ "$v_rc" -eq 0 ] && printf '%s\n' "$v_out" | grep -q '^phase P1 review: pass' \
    && ! printf '%s\n%s\n' "$s_out" "$v_out" | grep -q TypeError \
    && python3 - "$PLUGIN"/scripts/*.py <<'PY'
import ast, collections, sys
names = collections.Counter(n.name for f in sys.argv[1:] for n in ast.parse(open(f).read()).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
assert not [k for k, v in names.items() if v > 1], [k for k, v in names.items() if v > 1]
PY
then ok "a nested phase whose host branch left main gets its phase scope and a passing review (no _is_ancestor TypeError), and no engine function is defined twice"
else bad "the _is_ancestor regression is back (scope rc=$s_rc, review rc=$v_rc) -- $s_out / $v_out"; fi
# (S13) on a nested host with an origin, a PR base is recorded as the branch name gh pr create --base takes, and pr check
# diffs origin/<base>: the default records main (not origin/main); --base origin/main records main; a stack part's base stays
# feat/o; a sha is refused; an old record holding base=origin/main reads as main; a base with no remote ref diffs the local branch.
newtmp PRO; git init -q --bare "$PRO/origin.git"; NH="$PRO/host"; mkdir -p "$NH"; ngit() { git -C "$NH" "$@"; }
nw() { ( cd "$NH" && python3 "$ENG" "$@" ); }
{ ngit init -q . && ngit symbolic-ref HEAD refs/heads/main && ngit config user.email smoke@example.invalid && ngit config user.name smoke \
  && echo a > "$NH/app.txt" && ngit add app.txt && ngit commit -qm "chore: init" && ngit remote add origin "$PRO/origin.git" \
  && ngit push -q origin main && ngit remote set-head origin main && mkhost "$NH" \
  && git -C "$NH/.sikstack" config user.email smoke@example.invalid && git -C "$NH/.sikstack" config user.name smoke \
  && nw phase new --phase P1 --name base --objective toy; } >/dev/null 2>&1 || bad "pr base probe: the nested host with an origin failed to set up"
o1=$(nw pr branch P1 --name feat/o 2>&1); { echo b >> "$NH/app.txt" && ngit commit -qam "feat: b"; } >/dev/null 2>&1
o2=$(nw pr branch P1 --name feat/p --base origin/main 2>&1); ngit switch -q feat/o
o3=$(nw pr branch P1 --name feat/q --base feat/o 2>&1); ngit switch -q feat/o
nw pr branch P1 --name feat/s --base "$(ngit rev-parse main)" > "$PRO/o4.txt" 2>&1; o4=$?
oc1=$(nw pr check P1 --branch feat/o 2>&1); oc3=$(nw pr check P1 --branch feat/q 2>&1)
python3 - "$NH/.sikstack/works/phases/active/P1/phase.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["pr"]["branches"][0]["base"] = "origin/main"; json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
oc_old=$(nw pr check P1 --branch feat/o 2>&1); o_nx=$(nw next 2>&1); o_val=$(nw check --no-rebuild 2>&1); o_vrc=$?
if printf '%s\n' "$o1" | grep -qx 'pr_branch=host:feat/o base=main' && printf '%s\n' "$o2" | grep -qx 'pr_branch=host:feat/p base=main' \
    && printf '%s\n' "$o3" | grep -qx 'pr_branch=host:feat/q base=feat/o' && [ "$o4" -eq 1 ] && grep -q 'a PR base must be a branch' "$PRO/o4.txt" \
    && printf '%s\n' "$oc1" | grep -qx 'pr_check=host:feat/o base=main' && printf '%s\n' "$oc1" | grep -qx 'diff_base=origin/main' \
    && printf '%s\n' "$oc1" | grep -qx 'size=1 size_status=info' && printf '%s\n' "$oc3" | grep -qx 'diff_base=feat/o' \
    && printf '%s\n' "$oc1" | grep -q '^body=missing (topics/pr-body.md)$' && printf '%s\n' "$oc1" | grep -qx 'pr_check=warn' \
    && printf '%s\n' "$oc_old" | grep -qx 'pr_check=host:feat/o base=main' && printf '%s\n' "$oc_old" | grep -qx 'diff_base=origin/main' \
    && printf '%s\n' "$o_nx" | grep -qx 'pr_branch=host:feat/o base=main url=none' && [ "$o_vrc" -eq 0 ]; then
  ok "with an origin, pr branch records the PR base as a branch name (default main, --base origin/main as main, a stack part's feat/o) and refuses a sha; pr check prints diff_base=origin/main, or the local branch with no remote ref; an old base=origin/main record reads as main; a nested host keeps host: and a missing default body warns, never passes"
else bad "PR base as a branch name wrong (sha rc $o4, validate rc $o_vrc) -- $o1 / $o2 / $o3 / $(cat "$PRO/o4.txt") / $oc1 / $oc3 / $oc_old / $(printf '%s\n' "$o_nx" | grep pr_) / $(printf '%s\n' "$o_val" | tail -3)"; fi
echo "pr rule test runtime: $(( $(date +%s) - pr_t0 ))s"

# ---------------------------------------------------------------------------
echo "== Test 20: P52 PR lifecycle after the draft -- pr sync (all or nothing, ready_at once), pr team (solo/team/unknown, --record), pr_open= on every next path and the card, the archive hold (merged releases it, --force bypasses, rotate still proposes the docs), pr_stack= (moved/merged by ancestry or record, active or archived/gone) and the base re-record, phase reopen (nested worktree on the PR branch, its refusals, -reopen2), review refusing a change request on a done phase with an open PR, and a multi-repo host's --repo; zero GitHub writes =="
# Every remote is a local bare repo and gh is a stub on PATH that answers canned files, logs every call and refuses any write.
lc_t0=$(date +%s)
newtmp QW; QW=$(cd "$QW" && pwd -P); QG="$QW/gh"; mkdir -p "$QG"   # the engine prints resolved paths (macOS: /private/var)
cat > "$QG/gh" <<'STUB'
#!/bin/sh
# A stub gh: canned answers from its own folder, every call logged, every write refused. Nothing reaches GitHub.
D=$(cd "$(dirname "$0")" && pwd); printf '%s\n' "$*" >> "$D/gh.log"
[ -f "$D/fail" ] && { cat "$D/fail" >&2; exit 1; }
case "$1 $2" in
  "pr view") n=$(basename "$3"); [ -f "$D/pr-$n.json" ] || { echo "GraphQL: Could not resolve to a PullRequest with the number of $n." >&2; exit 1; }; cat "$D/pr-$n.json";;
  "pr checks") cat "$D/checks.txt" 2>/dev/null; exit "$(cat "$D/checks.rc" 2>/dev/null || echo 0)";;
  api\ *) for a in "$@"; do case "$a" in -X|--method|-f|-F|--field|--raw-field) echo "stub: a write refused" >&2; exit 9;; esac; done
    [ -f "$D/collab-403" ] && { echo "gh: Must have push access to view repository collaborators. (HTTP 403)" >&2; exit 1; }; cat "$D/collab.txt" 2>/dev/null;;
  *) echo "stub: refused $*" >&2; exit 9;;
esac
STUB
chmod +x "$QG/gh"
qpr() { printf '{"state":"%s","isDraft":%s,"mergedAt":%s,"baseRefName":"%s","headRefOid":"0123456789abcdef0123456789abcdef01234567","reviewDecision":%s}\n' "$2" "$3" "$4" "${5:-main}" "${6:-null}" > "$QG/pr-$1.json"; }
# --- the nested host: a toy product with a local bare origin, its install committed ---
git init -q --bare "$QW/origin.git"; QH="$QW/host"; mkdir -p "$QH"
qw() { ( cd "$QH" && PATH="$QG:$PATH" python3 "$ENG" "$@" ); }
qg() { git -C "$QH" "$@"; }; qn() { git -C "$QH/.sikstack" "$@"; }
qj() { python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d = d.get(k) if isinstance(d, dict) else (d[int(k)] if isinstance(d, list) and len(d) > int(k) else None)
print(json.dumps(d, sort_keys=True))' "$QH/.sikstack/works/phases/active/$1/phase.json" "$2"; }
qsig() { { qn rev-parse HEAD; qn status --porcelain; cat "$QH/.sikstack/works/events.jsonl"; } | sha_stdin; }
{ qg init -q . && qg symbolic-ref HEAD refs/heads/main && qg config user.email smoke@example.invalid && qg config user.name smoke \
  && echo a > "$QH/app.txt" && qg add app.txt && qg commit -qm "chore: init" && qg remote add origin "$QW/origin.git" && qg push -q origin main \
  && qg remote set-head origin main && mkhost "$QH" && qn config user.email smoke@example.invalid && qn config user.name smoke \
  && qw repo convention --confirm --text "type(scope): summary" --trailers forbidden && qn add -A && qn commit -qm "chore: install"; } > "$QW/setup.txt" 2>&1 \
  || bad "lifecycle probe: the nested host failed to set up -- $(tail -3 "$QW/setup.txt")"
# a waived-gate phase cut to its review: qnew <P>; driven to done: qpass <P>
qnew() { qw phase new --phase "$1" --name "$1 toy" --objective toy && qw gate "$1" waive --note toy && qw slice status "$1.DECOMP" done; }
qpass() { { qw slice status "$1.REVIEW" in_progress && : > "$QH/.sikstack/works/phases/active/$1/slices/$1.REVIEW/result.md" && qw review "$1" --verdict pass \
  && qn add -A && qn commit -qm "chore: $1 done"; } > "$QW/pass-$1.txt" 2>&1 || bad "lifecycle probe: $1 did not pass -- $(tail -3 "$QW/pass-$1.txt")"; }
# P1: a required-gate phase done with its draft recorded the P51 way (a URL, no lifecycle state).
{ qw phase new --phase P1 --name "Toy" --objective toy && qw gate P1 require && qw slice status P1.DECOMP done \
  && qw pr branch P1 --name feat/one && echo one >> "$QH/app.txt" && qg commit -qam "feat: one" && qg push -q -u origin feat/one \
  && qw pr record P1 --url https://github.com/acme/toy/pull/1 && qw slice status P1.REVIEW in_progress \
  && : > "$QH/.sikstack/works/phases/active/P1/slices/P1.REVIEW/result.md" && qw gate P1 open --walkthrough probe && qw gate P1 clear --words accept \
  && qw review P1 --verdict pass && qn add -A && qn commit -qm "chore: P1 done"; } > "$QW/p1.txt" 2>&1 || bad "lifecycle probe: P1 failed -- $(tail -3 "$QW/p1.txt")"
P1J="$QH/.sikstack/works/phases/active/P1/phase.json"; QEV="$QH/.sikstack/works/events.jsonl"
# (1) a P51-era entry validates and reads unsynced: the close is due; no active phase, so the line is on the no-phase path and the card.
q_val=$(qw check --no-rebuild 2>&1); q_vrc=$?; q_nx=$(qw next 2>&1); q_card=$(qw next --card 2>&1)
if [ "$q_vrc" -eq 0 ] && printf '%s\n' "$q_nx" | grep -qx 'pr_open=P1 host:feat/one state=unsynced url=https://github.com/acme/toy/pull/1 -- the close is due (close P1)' \
    && printf '%s\n' "$q_nx" | grep -q '^no active slice' && printf '%s\n' "$q_card" | grep -qx 'pr_open: P1 host:feat/one state=unsynced (close due)'; then
  ok "a P51-era pr entry (a URL, no lifecycle state) validates and reads state=unsynced: next's no-active-phase path and the resume card print pr_open= with the close due"
else bad "P51-era entry / pr_open= on the no-phase path wrong (validate rc=$q_vrc) -- $q_val / $q_nx / $q_card"; fi
# (2) pr sync: gh unauthenticated and an unknown PR each exit 1 writing nothing; a draft, then ready (ready_at stamped), then a
# second ready sync keeps ready_at.
s0=$(cat "$P1J" "$QEV" | sha_stdin)
echo "gh: To get started with GitHub CLI, please run:  gh auth login" > "$QG/fail"; q_a=$(qw pr sync P1 2>&1); q_arc=$?; rm -f "$QG/fail"
q_u=$(qw pr sync P1 2>&1); q_urc=$?; s1=$(cat "$P1J" "$QEV" | sha_stdin)
qpr 1 OPEN true null; q_d=$(qw pr sync P1 2>&1); q_dst=$(qj P1 pr.branches.0.state); q_dra=$(qj P1 pr.branches.0.ready_at)
qpr 1 OPEN false null main '"REVIEW_REQUIRED"'; q_r=$(qw pr sync P1 2>&1); q_rst=$(qj P1 pr.branches.0.state); q_rra=$(qj P1 pr.branches.0.ready_at)
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["pr"]["branches"][0]["ready_at"]="2026-01-01T00:00:00Z"; json.dump(d,open(sys.argv[1],"w"),indent=2)' "$P1J"
qw pr sync P1 >/dev/null 2>&1; q_rra2=$(qj P1 pr.branches.0.ready_at)
if [ "$q_arc" -eq 1 ] && printf '%s\n' "$q_a" | grep -q 'gh is not authenticated .*nothing was written$' && [ "$q_urc" -eq 1 ] && printf '%s\n' "$q_u" | grep -q 'Could not resolve.*nothing was written$' && [ "$s0" = "$s1" ] \
    && printf '%s\n' "$q_d" | grep -qx 'pr_sync=host:feat/one state=draft base=main head=0123456 review=none merged_at=none' && [ "$q_dst" = '"draft"' ] && [ "$q_dra" = null ] \
    && printf '%s\n' "$q_r" | grep -qx 'pr_sync=host:feat/one state=ready base=main head=0123456 review=REVIEW_REQUIRED merged_at=none' && [ "$q_rst" = '"ready"' ] && [ "$q_rra" != null ] \
    && [ "$q_rra2" = '"2026-01-01T00:00:00Z"' ]; then
  ok "pr sync: gh unauthenticated and an unknown PR exit 1 naming the cause and write nothing (phase.json and events.jsonl unchanged); a draft records state=draft with no ready_at, Ready stamps ready_at, and a later sync never re-stamps it"
else bad "pr sync lifecycle wrong (rc $q_arc/$q_urc, unchanged=$([ "$s0" = "$s1" ] && echo y)) -- $q_a / $q_u / $q_d / $q_r / ready_at $q_dra $q_rra $q_rra2"; fi
# (3) pr team, bare: solo (one collaborator), team (two, a bot dropped), solo again on a 403 (authors only); --record needs
# --evidence, records, then a re-record replaces; validate refuses a malformed ownership record.
qg remote set-url origin https://github.com/acme/toy.git
printf 'leetusik\n' > "$QG/collab.txt"; q_t1=$(qw pr team 2>&1)
printf 'leetusik\nalice\nrenovate[bot]\n' > "$QG/collab.txt"; q_t2=$(qw pr team 2>&1)
: > "$QG/collab-403"; q_t3=$(qw pr team 2>&1); rm -f "$QG/collab-403"; qg remote set-url origin "$QW/origin.git"
qw pr team --record solo > "$QW/t-noev.txt" 2>&1; q_t4=$?
q_t5=$(qw pr team --record solo --evidence "one login" 2>&1); q_t6=$(qw pr team --record team --evidence "two logins" 2>&1)
QMK="$QH/.sikstack/.agentic-nested.json"; q_own=$(python3 -c 'import json,sys; o=json.load(open(sys.argv[1]))["pr_rules"]["ownership"]; print(len(o), o[0]["mode"], o[0]["repo"])' "$QMK")
cp "$QMK" "$QW/marker.bak"; python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["pr_rules"]["ownership"][0]["mode"]="duo"; json.dump(d,open(sys.argv[1],"w"),indent=2)' "$QMK"
qw check --no-rebuild > "$QW/val-own.txt" 2>&1; q_t7=$?; cp "$QW/marker.bak" "$QMK"
if printf '%s\n' "$q_t1" | grep -qx 'pr_team=host recorded=none detected=solo evidence="collaborators: 1 (leetusik); authors: 1"' \
    && printf '%s\n' "$q_t2" | grep -qx 'pr_team=host recorded=none detected=team evidence="collaborators: 2 (alice, leetusik); authors: 1"' \
    && printf '%s\n' "$q_t3" | grep -qx 'pr_team=host recorded=none detected=solo evidence="collaborators: unavailable; authors: 1"' \
    && [ "$q_t4" -eq 1 ] && grep -q 'needs --evidence.*nothing was written' "$QW/t-noev.txt" && printf '%s\n' "$q_t5" | grep -q '^pr team: recorded -- host is solo' \
    && printf '%s\n' "$q_t6" | grep -q '^pr team: replaced -- host is team' && [ "$q_own" = "1 team None" ] && [ "$q_t7" -ne 0 ] && grep -q 'duo' "$QW/val-own.txt" && qw check --no-rebuild >/dev/null 2>&1; then
  ok "pr team: detects solo (one collaborator), team (two, a [bot] dropped) and solo from authors when collaborators answer 403; --record without --evidence writes nothing, records solo, then team replaces it (one ownership entry); validate refuses mode duo and passes restored"
else bad "pr team wrong (noev rc $q_t4, validate rc $q_t7, ownership '$q_own') -- $q_t1 / $q_t2 / $q_t3 / $q_t5 / $q_t6 / $(cat "$QW/val-own.txt" | tail -3)"; fi
# (4) the archive hold is advice now: P2 holds two PRs (a split); a sync whose second read fails writes nothing; once both read
# merged phase archive archives it with no advice. P3's closed PR keeps phase rotate's sweep off it; phase archive P3 archives it
# with one advice: line.
{ qnew P2 && qg switch -q main && qw pr branch P2 --name feat/two && echo two > "$QH/two.txt" && qg add two.txt && qg commit -qm "feat: two" && qg push -q -u origin feat/two \
  && qw pr branch P2 --name feat/three --base feat/two && echo three > "$QH/three.txt" && qg add three.txt && qg commit -qm "feat: three" && qg push -q -u origin feat/three \
  && qw pr record P2 --branch feat/two --url https://github.com/acme/toy/pull/2 && qw pr record P2 --branch feat/three --url https://github.com/acme/toy/pull/3; } > "$QW/p2.txt" 2>&1 \
  || bad "lifecycle probe: P2 failed -- $(tail -3 "$QW/p2.txt")"
qpass P2; P2J="$QH/.sikstack/works/phases/active/P2/phase.json"
qpr 2 MERGED false '"2026-11-05T08:00:00Z"'; s0=$(cat "$P2J" "$QEV" | sha_stdin); q_h1=$(qw pr sync P2 2>&1); q_h1rc=$?; s1=$(cat "$P2J" "$QEV" | sha_stdin)
qpr 3 MERGED false '"2026-11-05T09:00:00Z"' feat/two; qw pr sync P2 >/dev/null 2>&1; q_h3=$(qw phase archive P2 2>&1); q_h3rc=$?
{ qnew P3 && qg switch -q main && qw pr branch P3 --name feat/four && echo four > "$QH/four.txt" && qg add four.txt && qg commit -qm "feat: four" && qg push -q -u origin feat/four \
  && qw pr record P3 --url https://github.com/acme/toy/pull/4; } > "$QW/p3.txt" 2>&1 || bad "lifecycle probe: P3 failed -- $(tail -3 "$QW/p3.txt")"
qpass P3; qpr 4 CLOSED false null; qw pr sync P3 >/dev/null 2>&1
q_h4=$(qw next 2>&1); q_h6=$(qw phase rotate 2>&1); q_h6rc=$?; q_h6a=$([ -d "$QH/.sikstack/works/phases/active/P3" ] && [ -d "$QH/.sikstack/works/phases/active/P1" ] && echo y)
q_h5=$(qw phase archive P3 2>&1); q_h5rc=$?
if [ "$q_h1rc" -eq 1 ] && printf '%s\n' "$q_h1" | grep -q '^pr sync: host:feat/three .*nothing was written$' && [ "$s0" = "$s1" ] \
    && [ "$q_h3rc" -eq 0 ] && printf '%s\n' "$q_h3" | grep -q '^archived phase P2' && ! printf '%s\n' "$q_h3" | grep -q '^advice:' \
    && printf '%s\n' "$q_h4" | grep -qx 'pr_open=P3 host:feat/four state=closed url=https://github.com/acme/toy/pull/4 -- closed without merging: reopen it on GitHub and pr sync P3, or phase archive P3 (archived with advice)' \
    && [ "$q_h6rc" -eq 0 ] && [ "$(printf '%s\n' "$q_h6" | head -1)" = "rotate=archive" ] && [ "$q_h6a" = y ] \
    && [ "$q_h5rc" -eq 0 ] && printf '%s\n' "$q_h5" | grep -qx 'advice: P3: PR host:feat/four is closed, not merged (pr sync P3 reads it); archived anyway, so next no longer lists it' \
    && printf '%s\n' "$q_h5" | grep -q '^archived phase P3' && [ ! -d "$QH/.sikstack/works/phases/active/P3" ]; then
  ok "the archive hold is advice: a split's sync whose second read fails writes nothing; once pr sync reads both merged phase archive archives with no advice; a closed PR prints its pr_open= hint, phase rotate's sweep leaves it (and P1's open PR) active, and phase archive P3 archives it with one advice: line"
else bad "archive hold wrong (rc $q_h1rc/$q_h3rc/$q_h5rc/$q_h6rc, rotate kept '$q_h6a') -- $q_h1 / $q_h3 / $(printf '%s\n' "$q_h4" | grep pr_) / $q_h5 / $q_h6"; fi
# (5) pr_open= on the plain pointer and WAITING paths, then pr_stack=: P5 stacked on P4's feat/lo. A teammate's push to the lower
# branch reads lower=moved; its steps, run as printed, clear it. A true --no-ff landing of feat/lo reads lower=merged by ancestry.
{ qw phase new --phase P4 --name lower --objective toy && qg switch -q main && qw pr branch P4 --name feat/lo && echo lo > "$QH/lo.txt" && qg add lo.txt && qg commit -qm "feat: lo" && qg push -q -u origin feat/lo \
  && qw pr record P4 --url https://github.com/acme/toy/pull/5 && qw phase new --phase P5 --name upper --objective toy && qw pr branch P5 --name feat/up --base feat/lo \
  && echo up > "$QH/up.txt" && qg add up.txt && qg commit -qm "feat: up" && qg push -q -u origin feat/up && qw pr record P5 --url https://github.com/acme/toy/pull/6 \
  && qn add -A && qn commit -qm "chore: the stack"; } > "$QW/p45.txt" 2>&1 || bad "lifecycle probe: P4/P5 failed -- $(tail -3 "$QW/p45.txt")"
q_p1=$(qw next 2>&1); qw slice status P4.DECOMP pending --stop-kind decision --on-words "an answer resumes it" >/dev/null 2>&1; q_p2=$(qw next 2>&1); q_p2c=$(qw next --card 2>&1)
qw slice status P4.DECOMP in_progress >/dev/null 2>&1
newtmp QCL; { git clone -q -b main "$QW/origin.git" "$QCL/c" && git -C "$QCL/c" switch -q feat/lo && echo fix >> "$QCL/c/lo.txt" \
  && git -C "$QCL/c" -c user.email=mate@example.invalid -c user.name=mate commit -qam "fix: lo" && git -C "$QCL/c" push -q && qg fetch -q origin; } >/dev/null 2>&1
q_mv=$(qw next 2>&1 | grep '^pr_stack='); ( eval "${q_mv#* -- }" ) >/dev/null 2>&1; q_mvrc=$?; q_mv2=$(qw next 2>&1 | grep -c '^pr_stack=')
{ qg switch -q main && qg merge -q --no-ff feat/lo -m "merge feat/lo" && qg push -q origin main; } >/dev/null 2>&1
q_mg=$(qw next 2>&1 | grep '^pr_stack='); q_mgc=$(qw next --card 2>&1 | grep '^pr_stack:')
if printf '%s\n' "$q_p1" | grep -q '^pr_open=P1 host:feat/one state=ready ' && printf '%s\n' "$q_p1" | grep -qx 'current_slice=P4.DECOMP' \
    && printf '%s\n' "$q_p2" | grep -q '^pr_open=P1 host:feat/one state=ready ' && printf '%s\n' "$q_p2" | grep -q '^WAITING ON OPERATOR' && printf '%s\n' "$q_p2c" | grep -q '^pr_open: P1 host:feat/one state=ready' \
    && [ "$q_mv" = "pr_stack=P5 host:feat/up base=feat/lo lower=moved -- git -C $QH merge --no-ff origin/feat/lo; git -C $QH push" ] && [ "$q_mvrc" -eq 0 ] && [ "$q_mv2" = 0 ] \
    && [ "$q_mg" = "pr_stack=P5 host:feat/up base=feat/lo lower=merged -- git -C $QH fetch origin; git -C $QH switch feat/up; git -C $QH merge --no-ff origin/main; git -C $QH push; gh pr edit 6 --base main; sikstack pr branch P5 --name feat/up --base main" ] \
    && [ "$q_mgc" = 'pr_stack: P5 host:feat/up base=feat/lo lower=merged (`next` prints the steps)' ]; then
  ok "pr_open= prints on next's plain pointer and WAITING paths and the card; pr_stack= reads a teammate's push to the lower branch as lower=moved, whose printed steps (merge, never rebase; push, never --force) clear it, and a true --no-ff landing as lower=merged with the fetch/switch/merge/push/gh pr edit/re-record steps, in next and the card"
else bad "pr_open= paths or pr_stack= moved/merged wrong (steps rc $q_mvrc, after $q_mv2) -- $(printf '%s\n' "$q_p1" "$q_p2" | grep 'pr_\|WAITING\|current_slice') / $q_mv / $q_mg / $q_mgc"; fi
# (6) the base re-record on a not-checked-out branch with a dirty tree: HEAD, branch and status untouched, lifecycle fields kept, no line after.
qpr 6 OPEN true null feat/lo; qw pr sync P5 >/dev/null 2>&1; echo dirty >> "$QH/app.txt"
q_h0=$(qg rev-parse HEAD); q_s0=$(qg status --porcelain); q_b0=$(qg branch --show-current)
q_rr=$(qw pr branch P5 --name feat/up --base main 2>&1); q_rrc=$?
q_same=$([ "$q_h0" = "$(qg rev-parse HEAD)" ] && [ "$q_s0" = "$(qg status --porcelain)" ] && [ "$q_b0" = "$(qg branch --show-current)" ] && echo y)
q_rrs=$(qj P5 pr.branches.0.state); q_rrn=$(qw next 2>&1 | grep -c '^pr_stack='); qg checkout -q -- app.txt
[ "$q_rrc" -eq 0 ] && printf '%s\n' "$q_rr" | grep -qx 'pr_branch=host:feat/up base=main' && printf '%s\n' "$q_rr" | grep -q '^pr branch: feat/up base re-recorded from feat/lo -- no switch; nothing moved' \
  && [ "$q_same" = y ] && [ "$q_rrs" = '"draft"' ] && [ "$(qj P5 pr.branches.0.base)" = '"main"' ] && [ "$q_rrn" = 0 ] \
  && ok "pr branch --base on a recorded branch that is not checked out, over a dirty tree, re-records the base only (HEAD, branch and status untouched, state=draft kept), and no pr_stack= line follows" \
  || bad "the base re-record wrong (rc $q_rrc, untouched '$q_same', state $q_rrs, lines $q_rrn) -- $q_rr"
# (7) a squash landing has no ancestry: no line until the lower PR's record reads merged, active and then archived; a vanished
# lower branch reads lower=gone, and an entry with no URL drops the gh step.
{ qnew P6 && qw pr branch P6 --name feat/l2 && echo l2 > "$QH/l2.txt" && qg add l2.txt && qg commit -qm "feat: l2" && qg push -q -u origin feat/l2 && qw pr record P6 --url https://github.com/acme/toy/pull/7 \
  && qw phase new --phase P7 --name u2 --objective toy && qw pr branch P7 --name feat/u2 --base feat/l2 && echo u2 > "$QH/u2.txt" && qg add u2.txt && qg commit -qm "feat: u2" && qg push -q -u origin feat/u2 \
  && qw pr record P7 --url https://github.com/acme/toy/pull/8 && qg switch -q main && qg merge -q --squash feat/l2 && qg commit -qm "feat: l2 (squash)" && qg push -q origin main \
  && qn add -A && qn commit -qm "chore: P6 P7"; } > "$QW/p67.txt" 2>&1 || bad "lifecycle probe: P6/P7 failed -- $(tail -3 "$QW/p67.txt")"
q_sq0=$(qw next 2>&1 | grep -c '^pr_stack=P7'); qpass P6; qpr 7 MERGED false '"2026-11-05T10:00:00Z"'; qw pr sync P6 >/dev/null 2>&1
q_sq1=$(qw next 2>&1 | grep '^pr_stack=P7'); qw phase archive P6 >/dev/null 2>&1; q_sq2=$(qw next 2>&1 | grep '^pr_stack=P7')
{ qw phase new --phase P8 --name u3 --objective toy && qg switch -q -c feat/l3 && qw pr branch P8 --name feat/u3 --base feat/l3 && qg branch -q -D feat/l3; } > "$QW/p8.txt" 2>&1 || bad "lifecycle probe: P8 failed -- $(tail -3 "$QW/p8.txt")"
q_gone=$(qw next 2>&1 | grep '^pr_stack=P8')
q_sqx="pr_stack=P7 host:feat/u2 base=feat/l2 lower=merged -- git -C $QH fetch origin; git -C $QH switch feat/u2; git -C $QH merge --no-ff origin/main; git -C $QH push; gh pr edit 8 --base main; sikstack pr branch P7 --name feat/u2 --base main"
[ "$q_sq0" = 0 ] && [ "$q_sq1" = "$q_sqx" ] && [ "$q_sq2" = "$q_sqx" ] && [ ! -d "$QH/.sikstack/works/phases/active/P6" ] \
  && [ "$q_gone" = "pr_stack=P8 host:feat/u3 base=feat/l3 lower=gone -- git -C $QH fetch origin; git -C $QH merge --no-ff origin/main; git -C $QH push; sikstack pr branch P8 --name feat/u3 --base main" ] \
  && ok "pr_stack=: a squash landing prints nothing until the lower PR's record reads merged, then lower=merged from the active record and, archived, from the archived one; a vanished lower branch reads lower=gone, and with no URL the gh pr edit step is dropped" \
  || bad "pr_stack= squash/record/gone wrong (no-record lines $q_sq0) -- $q_sq1 / $q_sq2 / $q_gone"
qg switch -q main; qn add -A; qn commit -qm "chore: before the reopen" >/dev/null 2>&1
# (8) the nested reopen's refusals, each writing nothing: review changes_requested on a done phase with an open PR, an empty
# note, a phase not done, an archived phase, the host's main checkout holding the PR branch, and every PR recorded merged.
r0=$(qsig)
q_c1=$(qw review P1 --verdict changes_requested --note x 2>&1); q_c1rc=$?
q_c2=$(qw phase reopen P1 --note "  " 2>&1); q_c2rc=$?
q_c3=$(qw phase reopen P4 --note "team-reported: x" 2>&1); q_c3rc=$?
q_c4=$(qw phase reopen P3 --note "team-reported: x" 2>&1); q_c4rc=$?
qg switch -q feat/one; q_c5=$(qw phase reopen P1 --note "team-reported: x" 2>&1); q_c5rc=$?; qg switch -q main
cp "$P1J" "$QW/p1.bak"; python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["pr"]["branches"][0]["state"]="merged"; json.dump(d,open(sys.argv[1],"w"),indent=2)' "$P1J"
q_c6=$(qw phase reopen P1 --note "team-reported: x" 2>&1); q_c6rc=$?; cp "$QW/p1.bak" "$P1J"; r1=$(qsig)
if [ "$q_c1rc" -ne 0 ] && printf '%s\n' "$q_c1" | grep -q 'P1 is done and its PR is still open .*phase reopen P1' && [ "$q_c2rc" -ne 0 ] && printf '%s\n' "$q_c2" | grep -q -- '--note is empty.*operator-reported: <what>' \
    && [ "$q_c3rc" -ne 0 ] && printf '%s\n' "$q_c3" | grep -q "P4 is 'planned', not 'done'" && [ "$q_c4rc" -ne 0 ] && printf '%s\n' "$q_c4" | grep -q 'P3 is archived' \
    && [ "$q_c5rc" -ne 0 ] && printf '%s\n' "$q_c5" | grep -q "checked out in the main checkout .* switch main" && [ "$q_c6rc" -ne 0 ] && printf '%s\n' "$q_c6" | grep -q 'every recorded PR reads state=merged .*pr sync P1' \
    && [ "$(printf '%s\n' "$q_c1" "$q_c2" "$q_c3" "$q_c4" "$q_c5" "$q_c6" | grep -c 'nothing was written')" = 6 ] && [ "$r0" = "$r1" ] && [ "$(qj P1 status)" = '"done"' ]; then
  ok "phase reopen refuses an empty note, a phase not done, an archived phase, the host's main checkout holding the PR branch and every PR recorded merged, and review refuses changes_requested on a done phase with an open PR pointing at phase reopen; each writes nothing (nested HEAD, status and events unchanged)"
else bad "the reopen refusals wrong (rc $q_c1rc/$q_c2rc/$q_c3rc/$q_c4rc/$q_c5rc/$q_c6rc, unchanged=$([ "$r0" = "$r1" ] && echo y)) -- $q_c1 / $q_c2 / $q_c3 / $q_c4 / $q_c5 / $q_c6"; fi
# (9) the nested reopen: one stamp commit, the worktree pair on the PR branch, next in both checkouts, a refusal from the phase's
# own stream, the fix and the pass there with phase scope covering it, host main untouched; a still-stamped pair refuses a second
# reopen until the teardown, and a stale branch name gives -reopen2.
q_m0=$(qg rev-parse main); q_n0=$(qn rev-list --count HEAD)
q_ro=$(qw phase reopen P1 --note "team-reported: rename the toy flag" 2>&1); q_rorc=$?
QWT=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["execution"]["host_worktree"] or "")' "$P1J" 2>/dev/null)
qwt() { ( cd "$QWT" && PATH="$QG:$PATH" python3 "$ENG" "$@" ); }
git -C "$QWT/.sikstack" config user.email smoke@example.invalid; git -C "$QWT/.sikstack" config user.name smoke
q_dn=$(qw next 2>&1); q_wn=$(qwt next 2>&1); q_ws=$(qwt phase reopen P1 --note "team-reported: again" 2>&1); q_wsrc=$?
{ qwt slice status P1.REVIEW in_progress && echo fix > "$QWT/fix.py" && git -C "$QWT" add fix.py && git -C "$QWT" commit -qm "fix: rename" \
  && qwt gate P1 open --walkthrough again && qwt gate P1 clear --words accept && qwt review P1 --verdict pass && git -C "$QWT/.sikstack" add -A && git -C "$QWT/.sikstack" commit -qm "chore: P1 re-pass"; } > "$QW/repass.txt" 2>&1
q_rprc=$?; q_sc=$(qwt phase scope P1 2>&1)
if [ "$q_rorc" -eq 0 ] && printf '%s\n' "$q_ro" | grep -qx "reopened=P1 branch=host:feat/one worktree=$QH/.claude/worktrees/P1-toy" && [ "$(( $(qn rev-list --count HEAD) - q_n0 ))" = 1 ] \
    && [ "$(qn log -1 --format=%s)" = "chore(works): reopen P1 in its own worktree" ] && [ "$(git -C "$QWT" branch --show-current)" = feat/one ] \
    && [ "$(qj P1 review.status)" = '"changes_requested"' ] && [ "$(qj P1 review.note)" = '"team-reported: rename the toy flag"' ] && [ "$(qj P1 review.fix_passes)" = 1 ] \
    && printf '%s\n' "$q_dn" | grep -q '^parallel_phases_elsewhere=P1:phase/P1-toy ' && printf '%s\n' "$q_wn" | grep -qx 'current_phase=P1' && printf '%s\n' "$q_wn" | grep -qx 'current_slice=P1.REVIEW' \
    && [ "$q_wsrc" -ne 0 ] && printf '%s\n' "$q_ws" | grep -q "P1 is 'in_progress', not 'done'" \
    && [ "$q_rprc" -eq 0 ] && grep -q '^phase P1 review: pass' "$QW/repass.txt" && printf '%s\n' "$q_sc" | grep -qx '  A fix.py' && printf '%s\n' "$q_sc" | grep -qx '  M app.txt' \
    && [ "$q_m0" = "$(qg rev-parse main)" ]; then
  ok "phase reopen on a nested install: one stamp commit, a worktree pair on the PR branch feat/one, the review changes_requested with the team's note; the default stream lists it elsewhere, the worktree's next selects P1.REVIEW and refuses a second reopen there; the fix and the pass land in the worktree, phase scope covers fix.py, and host main is untouched"
else bad "the nested reopen wrong (rc $q_rorc/$q_wsrc/$q_rprc) -- $q_ro / $(printf '%s\n' "$q_dn" | grep parallel_) / $(printf '%s\n' "$q_wn" | grep current_) / $q_ws / $(tail -3 "$QW/repass.txt") / $q_sc"; fi
{ qn add -A && qn commit -qm "chore: rebuild"; qn merge -q --no-ff -m "merge(P1): Toy" phase/P1-toy || { qn checkout -q --theirs backlog.md && qn add -A && qn commit -qm "merge(P1): Toy"; }; \
  qw worktree merge-finish && qn add -A && qn commit -qm "chore: integrated"; } > "$QW/merge.txt" 2>&1
q_st=$(qw phase reopen P1 --note "team-reported: again" 2>&1); q_strc=$?
{ qw worktree teardown P1 && qn add -A && qn commit -qm "chore: teardown" && qn branch phase/P1-toy; } > "$QW/teardown.txt" 2>&1
q_r2=$(qw phase reopen P1 --note "operator-reported: again" 2>&1); q_r2rc=$?
if [ "$(qj P1 status)" != null ] && [ "$q_strc" -ne 0 ] && printf '%s\n' "$q_st" | grep -q 'worktree teardown P1 first' \
    && [ "$q_r2rc" -eq 0 ] && printf '%s\n' "$q_r2" | grep -qx 'branch=phase/P1-toy-reopen2' && printf '%s\n' "$q_r2" | grep -q '^reopened=P1 branch=host:feat/one ' \
    && printf '%s\n' "$q_r2" | grep -q "^next: .* -- read the operator's request (the reopen note 'operator-reported: again', plus any PR comment or failing check it points at), cut fix slices" \
    && ! printf '%s\n' "$q_r2" | grep -q "team's review" && printf '%s\n' "$q_ro" | grep -q "^next: .* -- read the team's review (gh pr view <n> --json reviews,comments), cut fix slices" \
    && [ "$q_m0" = "$(qg rev-parse main)" ] && ! git -C "$QH" merge-base --is-ancestor feat/one main; then
  ok "after the integration a still-stamped pair refuses a second reopen (worktree teardown first); after the teardown, with the old phase branch still present, the second reopen (operator-reported) cuts phase/P1-toy-reopen2 and its next: line reads the operator's request, never the team's review (the first, team-reported, reads the team's); host main never moved and feat/one is not in it"
else bad "the still-stamped refusal or -reopen2 wrong (rc $q_strc/$q_r2rc) -- $q_st / $q_r2 / $(tail -3 "$QW/merge.txt") / $(tail -3 "$QW/teardown.txt")"; fi
# (11) a multi-repo host: pr sync --repo reads one repo's PR; pr team needs --repo there; the pr_stack= steps carry --repo; the
# reopen needs --host-branch and builds its set from the open PR branches.
newtmp QMW; QMW=$(cd "$QMW" && pwd -P); QM="$QMW/host"; mkdir -p "$QM"
for r in api web; do git init -q --bare "$QMW/$r.git"; mkdir -p "$QM/$r"; ( cd "$QM/$r" && git init -q . && git symbolic-ref HEAD refs/heads/main && git config user.email smoke@example.invalid \
  && git config user.name smoke && echo "$r" > "$r.txt" && git add -A && git commit -qm "feat: $r" && git remote add origin "$QMW/$r.git" && git push -q origin main && git remote set-head origin main ) >/dev/null 2>&1; done
qm() { ( cd "$QM" && PATH="$QG:$PATH" python3 "$ENG" "$@" ); }
{ mkhost "$QM" && qm repo add api && qm repo add web && ( cd "$QM" && python3 "$ENG" init ) \
  && git -C "$QM" config user.email smoke@example.invalid && git -C "$QM" config user.name smoke && git -C "$QM/.sikstack" config user.email smoke@example.invalid && git -C "$QM/.sikstack" config user.name smoke \
  && qm phase new --phase P1 --name multi --objective toy && qm gate P1 waive --note toy && qm slice status P1.DECOMP done \
  && qm pr branch P1 --repo api --name feat/api && echo x >> "$QM/api/api.txt" && git -C "$QM/api" commit -qam "feat: x" && git -C "$QM/api" push -q -u origin feat/api \
  && qm pr branch P1 --repo web --name feat/web && echo y >> "$QM/web/web.txt" && git -C "$QM/web" commit -qam "feat: y" && git -C "$QM/web" push -q -u origin feat/web \
  && qm pr record P1 --repo api --url https://github.com/acme/api/pull/11 && qm pr record P1 --repo web --url https://github.com/acme/web/pull/21 \
  && qm slice status P1.REVIEW in_progress && : > "$QM/.sikstack/works/phases/active/P1/slices/P1.REVIEW/result.md" && qm review P1 --verdict pass \
  && git -C "$QM/.sikstack" add -A && git -C "$QM/.sikstack" commit -qm "P1 done"; } > "$QMW/setup.txt" 2>&1 || bad "multi-repo lifecycle probe: setup failed -- $(tail -3 "$QMW/setup.txt")"
mv "$QG/gh.log" "$QG/gh.log.nested" 2>/dev/null
qpr 11 OPEN false null; q_ms=$(qm pr sync P1 --repo api 2>&1); q_msrc=$?; q_mslog=$(cat "$QG/gh.log" 2>/dev/null)
q_mt0=$(qm pr team 2>&1); q_mt0rc=$?; q_mt=$(qm pr team --repo api 2>&1); q_mtr=$(qm pr team --record solo --repo api --evidence "one author" 2>&1); q_mo=$(qm next 2>&1 | grep '^pr_open=P1 api:')
{ qm phase new --phase P2 --name up --objective toy && qm pr branch P2 --repo api --name feat/api2 --base feat/api && echo z >> "$QM/api/api.txt" && git -C "$QM/api" commit -qam "feat: z" \
  && git -C "$QM/api" push -q -u origin feat/api2 && qm pr record P2 --repo api --url https://github.com/acme/api/pull/12 && git -C "$QM/api" switch -q main \
  && git -C "$QM/api" merge -q --no-ff feat/api -m "merge feat/api" && git -C "$QM/api" push -q origin main && git -C "$QM/web" switch -q main \
  && git -C "$QM/.sikstack" add -A && git -C "$QM/.sikstack" commit -qm "P2"; } > "$QMW/p2.txt" 2>&1 || bad "multi-repo lifecycle probe: P2 failed -- $(tail -3 "$QMW/p2.txt")"
q_mst=$(qm next 2>&1 | grep '^pr_stack=')
q_mr0=$(qm phase reopen P1 --note "team-reported: x" 2>&1); q_mr0rc=$?
q_mr=$(qm phase reopen P1 --note "team-reported: x" --host-branch hostfix 2>&1); q_mrrc=$?
if [ "$q_msrc" -eq 0 ] && printf '%s\n' "$q_ms" | grep -qx 'pr_sync=api:feat/api state=ready base=main head=0123456 review=none merged_at=none' && ! printf '%s\n' "$q_ms" | grep -q 'web:' \
    && [ "$q_mslog" = "pr view https://github.com/acme/api/pull/11 --json state,isDraft,mergedAt,baseRefName,headRefOid,reviewDecision,updatedAt,comments" ] \
    && [ "$q_mt0rc" -ne 0 ] && printf '%s\n' "$q_mt0" | grep -q 'needs --repo <name> (registered: api, web)' && printf '%s\n' "$q_mt" | grep -q '^pr_team=api recorded=none detected=solo ' \
    && printf '%s\n' "$q_mtr" | grep -q '^pr team: recorded -- api is solo' && printf '%s\n' "$q_mo" | grep -q "the close's merge is due" \
    && [ "$q_mst" = "pr_stack=P2 api:feat/api2 base=feat/api lower=merged -- git -C $QM/api fetch origin; git -C $QM/api switch feat/api2; git -C $QM/api merge --no-ff origin/main; git -C $QM/api push; gh pr edit 12 --base main; sikstack pr branch P2 --repo api --name feat/api2 --base main" ] \
    && [ "$q_mr0rc" -ne 0 ] && printf '%s\n' "$q_mr0" | grep -q -- '--host-branch <name> -- nothing was written' \
    && [ "$q_mrrc" -eq 0 ] && printf '%s\n' "$q_mr" | grep -qx "reopened=P1 branch=api:feat/api,web:feat/web worktree=$QM/.claude/worktrees/P1-multi"; then
  ok "multi-repo: pr sync --repo api reads only api's PR (one gh call); pr team needs --repo, reads api: and records it solo (its pr_open= hint then says the merge is due); the pr_stack= steps run in the api checkout and re-record with --repo api; the reopen refuses with no --host-branch, then builds the set api:feat/api,web:feat/web"
else bad "multi-repo lifecycle wrong (rc $q_msrc/$q_mt0rc/$q_mr0rc/$q_mrrc) -- $q_ms / log: $q_mslog / $q_mt0 / $q_mt / $q_mtr / $q_mo / $q_mst / $q_mr0 / $q_mr"; fi
# (12) zero GitHub writes: every call the stub saw is a read (pr view, the collaborators GET).
cat "$QG/gh.log.nested" "$QG/gh.log" 2>/dev/null > "$QG/gh.all"
q_w=$(grep -cvE '^(pr view https://github\.com/[^ ]+ --json [a-zA-Z,]+|api repos/[^ ]+/collaborators --paginate --jq \.\[\]\.login)$' "$QG/gh.all")
[ "$q_w" = 0 ] && [ "$(grep -c '' "$QG/gh.all")" -gt 10 ] && ok "zero GitHub writes: every one of the $(grep -c '' "$QG/gh.all") calls the stub gh saw is a read (pr view --json, the collaborators GET)" \
  || bad "the stub gh saw a call that is not a read -- $(grep -vE '^(pr view |api repos/)' "$QG/gh.all" | head -3)"
echo "pr lifecycle test runtime: $(( $(date +%s) - lc_t0 ))s"

# The engine counts a review cycle's fix passes: the first changes_requested prints the fix-slice hint and no count,
# a blocked verdict adds nothing, the second prints fix_passes=2 and the stop in place of the hint, and a pass
# ends the cycle (the next change request counts one again).
newtmp QRW; QR="$QRW/ws"; mkhost "$QR" >/dev/null 2>&1; qr() { ( cd "$QR" && python3 "$ENG" "$@" ); }
qr phase new --phase P9 --name count --objective count >/dev/null 2>&1
fp1=$(qr review P9 --verdict changes_requested --note one 2>&1)
fpb=$(qr review P9 --verdict blocked --note wait 2>&1)
fp2=$(qr review P9 --verdict changes_requested --note two 2>&1)
fpn() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["review"].get("fix_passes"))' "$QR/.sikstack/works/phases/active/P9/phase.json"; }
fp2n=$(fpn); qr gate P9 waive --note probe >/dev/null 2>&1; fpp=$(qr review P9 --verdict pass 2>&1); fppn=$(fpn)
fp3=$(qr review P9 --verdict changes_requested --note three 2>&1); fp3n=$(fpn)
if ! printf '%s\n' "$fp1$fpb" | grep -q 'fix_passes=' && printf '%s\n' "$fp1" | grep -q '^create fix slices' \
    && printf '%s\n' "$fp2" | grep -q "^fix_passes=2: the one fix pass already ran -- a further fix needs the operator's word" \
    && printf '%s\n' "$fp2" | grep -q 'slice status P9.REVIEW pending --stop-kind decision' \
    && ! printf '%s\n' "$fp2" | grep -q '^create fix slices' && [ "$fp2n" = 2 ] \
    && ! printf '%s\n' "$fp3" | grep -q 'fix_passes=' && printf '%s\n' "$fp3" | grep -q '^create fix slices' && [ "$fp3n" = 1 ]; then
  ok "review counts the cycle's fix passes: the hint and no count on the first changes_requested, fix_passes=2 with the stop in its place on the second, a blocked verdict adds none, a pass clears it"
else bad "the fix-pass count is wrong ($fp2n/$fppn/$fp3n) -- $fp1 / $fpb / $fp2 / $fpp / $fp3"; fi

# ---------------------------------------------------------------------------
echo "== Test 21: cloud mode at the command boundary -- inert without a [cloud] link in config.toml (no socket opened, no .hi2vi written); with a link, against a local fake hi2vi: one batch after a command (its own files origin command, an agent's result.md origin carried, the P9 records, both headers, the key only as a Bearer), equal content sends nothing, an archive goes as move ops and events.jsonl only as appends, a cloud-only change is pulled at the next command and the generated files rebuilt =="
cl_t0=$(date +%s)
newtmp CLW; CL="$CLW/host"; CLX="$CLW/xdg"; CL_OUT="$CLW/out.txt"; : > "$CL_OUT"
cl() { ( cd "$CL" && XDG_CONFIG_HOME="$CLX" python3 "$ENG" "$@" ) 2>&1 | tee -a "$CL_OUT"; }
# One engine command under a socket guard: any connect (or urlopen) ends the process with 97.
cl_nosock() { ( cd "$CL" && XDG_CONFIG_HOME="$CLX" python3 - "$@" <<'PY'
import os, runpy, socket, sys, urllib.request
def guard(*a, **k):
    sys.stderr.write("SOCKET-OPENED\n")
    os._exit(97)
socket.socket.connect = guard
socket.create_connection = guard
urllib.request.urlopen = guard
urllib.request.OpenerDirector.open = guard
sys.argv = [__import__("os").environ["ENG"]] + sys.argv[1:]
runpy.run_path(__import__("os").environ["ENG"], run_name="__main__")
PY
); }
{ mkhost "$CL" \
  && git -C "$CL" config user.email smoke@example.invalid && git -C "$CL" config user.name smoke \
  && git -C "$CL/.sikstack" config user.email smoke@example.invalid && git -C "$CL/.sikstack" config user.name smoke; } > "$CLW/setup.txt" 2>&1 \
  || bad "cloud probe: the install failed -- $(tail -3 "$CLW/setup.txt")"
# (a) local mode: no link file, so no command opens a socket or writes .hi2vi/ (byte-equal: the whole suite).
cl_in=""
for c in "next" "phase new --phase P1 --name One --objective toy" "phase new --phase P2 --name Two --objective toy" \
    "defer-job --title a --reason r --trigger t --source manual" "agenda-add --title x" "check" "check --no-rebuild" "next --card"; do
  # shellcheck disable=SC2086
  cl_nosock $c > "$CLW/nosock.txt" 2>&1; [ "$?" = 97 ] && cl_in="$cl_in [$c: $(tail -1 "$CLW/nosock.txt")]"
done
[ -z "$cl_in" ] && [ ! -e "$CL/.sikstack/.hi2vi" ] && [ -d "$CL/.sikstack/works/phases/active/P2" ] \
  && ok "local mode: with no [cloud] link, next, phase new, defer-job, agenda-add, check, check --no-rebuild and next --card open no socket and write no .hi2vi/" \
  || bad "local mode reached the network or wrote .hi2vi/ --$cl_in $(ls -a "$CL/.sikstack/.hi2vi" 2>/dev/null)"
# (b) link the checkout by hand to a fake hi2vi on a free port (the link command itself is not part of this check).
CLK="cloud-smoke-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s\n' "$CLK" > "$CLW/key"; chmod 600 "$CLW/key"
python3 "$REPO_ROOT/tests/fake_hi2vi.py" --dir "$CLW/fake" --port-file "$CLW/port" --key-file "$CLW/key" \
  --project proj-1 --org org-1 --lifetime 600 > "$CLW/fake.txt" 2>&1 &
CL_PID=$!
for _ in $(seq 1 100); do [ -s "$CLW/port" ] && break; sleep 0.1; done
CLS="http://127.0.0.1:$(cat "$CLW/port" 2>/dev/null)"
# The key sits in the pre-plugin engine's key file ($XDG_CONFIG_HOME/hi2vi/), which the engine still reads.
mkdir -p "$CL/.sikstack/.hi2vi" "$CLX/hi2vi" && chmod 700 "$CLX/hi2vi" && set_link "$CL/.sikstack" "$CLS"
python3 - "$CLX/hi2vi/workspace-keys.json" "$CLS" "$CLW/key" <<'PY' || bad "cloud probe: could not write the link"
import json, os, sys
keys, server, keyfile = sys.argv[1:]
with open(keyfile) as f:
    key = f.read().strip()
fd = os.open(keys, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump({server: {"proj-1": {"key": key, "org_id": "org-1", "saved_at": "2026-11-18T00:00:00Z"}}}, f)
PY
cl_mark() { if [ -f "$CLW/fake/requests.jsonl" ]; then grep -c '' "$CLW/fake/requests.jsonl"; else echo 0; fi; }
# cl_check <mark> <check> [args]: one named assertion over the fake's requests since <mark>, its state and base.json.
cl_check() { python3 - "$CLW/fake/requests.jsonl" "$CLS" "$CL/.sikstack" "$@" <<'PY'
import http.client, json, sys
from pathlib import Path
from urllib.parse import urlparse
log, server, root, mark, check, extra = sys.argv[1], sys.argv[2], Path(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6:]
lines = Path(log).read_text().splitlines() if Path(log).exists() else []
R = [json.loads(l) for l in lines[mark:]]
C = [r for r in R if r["path"].endswith("/commit")]
ops = [op for c in C for op in c["batch"]["ops"]]
u = urlparse(server)
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("GET", "/_fake/state")
S = json.loads(conn.getresponse().read())
base = json.loads((root / ".hi2vi/base.json").read_text()) if (root / ".hi2vi/base.json").exists() else {}
live = {p: f for p, f in S["files"].items() if not f["deleted"]}
def need(cond, why):
    if not cond:
        print(why)
        sys.exit(1)
need(R and all(r["checkout"] and (r["engine"] or "").startswith("v") and r["auth"] == "ok" for r in R),
     f"a request lacked X-Hi2vi-Checkout, X-Hi2vi-Engine: v<NN> or the Bearer key: {R[:1]}")
need(all(op["op"] != "put" or op["path"] != "works/events.jsonl" for op in ops), "works/events.jsonl went as a put")
if check == "first":
    need(len(C) == 1 and C[0]["status"] == 200, f"one batch expected, got {[c['status'] for c in C]}")
    need(all(op["origin"] == "carried" for op in ops), "a first sync's files are carried")
    need(all(op["op"] in ("put", "append") and op.get("base_rev") is None for op in ops), "a first sync only adds")
    need(any(op["op"] == "append" and op["path"] == "works/events.jsonl" for op in ops), "events.jsonl not sent as an append")
    need(not any(p.startswith("works/templates/") or p in ("works/state.json", "works/index.json",
         "backlog.md", "works/.workspace-version.json") for p in live), f"a non-truth file reached the cloud: {sorted(live)}")
    need("works/phases/active/P2/phase.json" in live and "docs/current/product.md" in live and "docs/index.json" not in live,
         "a truth file is missing in the cloud (the plain docs/current files are truth since the docs subsystem retired)")
    need(C[0]["batch"]["derived"] == ["works/index.json", "works/state.json"], f"the P9 records: {C[0]['batch']['derived']}")
    need(base.get("head") == S["head"] == 1 and set(base.get("files", {})) == set(live), "base.json does not match the cloud")
elif check == "carried":
    need(len(C) == 1 and C[0]["status"] == 200 and C[0]["batch"]["command"].startswith("defer-job "), "one defer-job batch expected")
    by = {(op["op"], op.get("path")): op for op in ops}
    res = by.get(("put", "works/phases/active/P1/slices/P1.DECOMP/result.md"))
    need(res is not None and res["origin"] == "carried" and res["base_rev"] is None, f"result.md: {res}")
    dj = [op for op in ops if op.get("path", "").endswith("/deferred.json")]
    need(dj and all(op["op"] == "put" and op["origin"] == "command" for op in dj), f"deferred.json: {dj}")
    ev = by.get(("append", "works/events.jsonl"))
    need(ev is not None and ev["origin"] == "command" and ev["lines"] >= 1, f"events: {ev}")
    need(C[0]["batch"]["derived"] == ["works/index.json", "works/state.json"], "the P9 records")
    need(base.get("head") == S["head"] and all(base["files"][p]["rev"] == live[p]["rev"] for p in live), "base.json not updated on 200")
elif check == "noop":
    need(not C and len([r for r in R if r["path"].endswith("/head")]) >= 2, f"equal content sent {len(C)} batch(es)")
elif check == "archive":
    need(len(C) == 1 and C[0]["status"] == 200, "one archive batch expected")
    mv = [op for op in ops if op["op"] == "move"]
    need(mv and all(op["from"].startswith("works/phases/active/P1/") and op["to"].startswith("works/phases/archived/") for op in mv), f"moves: {mv}")
    need(not [op for op in ops if op["op"] == "delete"], f"deletes sent: {[op for op in ops if op['op'] == 'delete']}")
    need(any(op["from"].endswith("/P1.DECOMP/result.md") for op in mv), "the carried result.md did not move")
    need([op["op"] for op in ops if op.get("path") == "works/events.jsonl"] == ["append"], "events.jsonl not one append")
    need(not [p for p in live if p.startswith("works/phases/active/P1/")], "P1 still live in the cloud")
elif check == "pulled":
    need(any(r["path"].endswith("/manifest") for r in R), "no manifest was read")
    need(any("works/phases/active/P2/phase.json" in (r.get("paths") or []) for r in R), "phase.json was not fetched")
    need(base.get("head") == S["head"], f"base head {base.get('head')} != cloud head {S['head']}")
    need(json.loads((root / "works/phases/active/P2/phase.json").read_text())["name"] == "Two, renamed in hi2vi", "disk not pulled")
print("ok")
PY
}
cl_m=$(cl_mark); cl next >/dev/null; cl_r=$(cl_check "$cl_m" first)
[ "$cl_r" = ok ] && ok "linked: the first command sends the truth set as one carried batch (works/events.jsonl as an append, never generated files, templates or the version marker), with the two P9 records; every request carries X-Hi2vi-Checkout, X-Hi2vi-Engine: v<NN> and the Bearer key; base.json holds the cloud's head" \
  || bad "linked first batch wrong -- $cl_r"
# (c) an agent writes result.md with plain file I/O; the next command's batch carries it.
printf 'an agent wrote this\n' > "$CL/.sikstack/works/phases/active/P1/slices/P1.DECOMP/result.md"
cl_m=$(cl_mark); cl defer-job --title b --reason r --trigger t --source manual >/dev/null; cl_r=$(cl_check "$cl_m" carried)
[ "$cl_r" = ok ] && ok "an agent-written result.md rides defer-job's one batch with origin carried, beside the command's deferred.json (origin command) and its events.jsonl lines (an append), and base.json takes the revisions on 200" \
  || bad "the carried batch wrong -- $cl_r"
# (d) equal content: the same bytes rewritten, then a rebuild and a read: no batch, base.json unchanged.
cl_b0=$(sha "$CL/.sikstack/.hi2vi/base.json"); sleep 1
printf 'an agent wrote this\n' > "$CL/.sikstack/works/phases/active/P1/slices/P1.DECOMP/result.md"
cl_m=$(cl_mark); cl check >/dev/null; cl next >/dev/null; cl_r=$(cl_check "$cl_m" noop)
[ "$cl_r" = ok ] && [ "$cl_b0" = "$(sha "$CL/.sikstack/.hi2vi/base.json")" ] \
  && ok "equal content is a no-op: result.md rewritten with its own bytes, then rebuild and next, send no batch and leave base.json byte-equal" \
  || bad "equal content sent a batch or moved base.json -- $cl_r"
# (e) an archive's folder move: move ops paired by sha, no delete, events.jsonl one append.
cl_m=$(cl_mark); cl phase archive P1 --force >/dev/null; cl_r=$(cl_check "$cl_m" archive)
[ "$cl_r" = ok ] && ok "phase archive's folder move goes as move ops paired by sha (no delete, the carried result.md moved too) and works/events.jsonl as one append, never a revisioned put" \
  || bad "the archive batch wrong -- $cl_r"
# (f) a change made only in the cloud (another checkout renames P2) is pulled at the next command, and the
# generated files are rebuilt after the pull: section is a read that renders nothing, so only the pull's rebuild can.
python3 - "$CLS" "$CL/.sikstack/works/phases/active/P2/phase.json" <<'PY' || bad "cloud probe: the fake write failed"
import http.client, json, sys
from urllib.parse import urlparse
data = json.load(open(sys.argv[2]))
data["name"] = "Two, renamed in hi2vi"
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("POST", "/_fake/write", json.dumps({"path": "works/phases/active/P2/phase.json",
             "content": json.dumps(data, ensure_ascii=False, indent=2) + "\n"}), {"Content-Type": "application/json"})
assert conn.getresponse().status == 200
PY
cl_m=$(cl_mark); cl section P2 Objective >/dev/null; cl_r=$(cl_check "$cl_m" pulled)
[ "$cl_r" = ok ] && grep -qF 'Two, renamed in hi2vi' "$CL/.sikstack/backlog.md" \
  && grep -qF 'Two, renamed in hi2vi' "$CL/.sikstack/works/index.json" \
  && ok "a cloud-only change is pulled at the next command's begin step (manifest, fetch, base.json at the cloud's head) and backlog.md and index.json are rebuilt from it" \
  || bad "the cloud-only change was not pulled and rebuilt -- $cl_r / $(grep -F 'Two' "$CL/.sikstack/backlog.md" | head -2)"
# (g) the key never reaches the tree, the command output or the fake's request log.
if grep -rqF "$CLK" "$CL" "$CL_OUT" "$CLW/fake" 2>/dev/null; then bad "the workspace key leaked into the tree, the output or the request log"
else ok "the workspace key appears nowhere in the checkout, the commands' output or the fake's request log"; fi
kill "$CL_PID" 2>/dev/null; wait "$CL_PID" 2>/dev/null
echo "cloud mode test runtime: $(( $(date +%s) - cl_t0 ))s"

# ---------------------------------------------------------------------------
echo "== Test 22: cloud mode's safety half, against the local fake hi2vi -- offline a command is refused with the one P8 line and the tree unchanged, and compact-resume fails open; a lost commit answer is resent with the same batch_id and lands once; a batch never sent goes at the next command; a command that dies midway leaves the journal running and the next command refuses naming sync; a pull killed at any step of an append-only file's merge (the event log, a local order of its own) leaves each line in hi2vi once; a stale write (409) keeps the disk, writes nothing in hi2vi and exits 1, then the mismatch refuses with nothing changed; two engine processes in one checkout are serialized by .hi2vi/lock; a change over 8,000,000 B goes as several batches, and one file too big for any batch is refused; every failure inside the boundary is one line, never a traceback (a cut or malformed answer, a commit answer cut mid-body, a fetch that does not decode, a write error during a pull), and the hook's note; compact-resume stays inside the hook's 15 s on a slow, dripping or slow-but-moving server; a request fails only when it stalls: a slow but moving pull, push and pushing resend each finish past 10 s, a stalled or dripping server ends an ordinary command in one line in bounded time, a 409 whose body stalls keeps its batch (never 0 conflicts), and no late timer turns a whole answer into a failure; every wait is judged, the set-up included: behind an HTTPS proxy that answers its CONNECT late or drips it, the hook keeps its 9 s and an ordinary command ends in one line; over TLS a byte counts as it crosses the socket and the handshake still verifies; a key holding a control character is refused unquoted =="
sf_t0=$(date +%s)
newtmp SFW; SF="$SFW/host"; SFX="$SFW/xdg"; SF_OUT="$SFW/out.txt"; : > "$SF_OUT"
sf() { ( cd "$SF" && XDG_CONFIG_HOME="$SFX" python3 "$(wf_entry "$1")" "$@" ) 2>&1 | tee -a "$SF_OUT"; return "${PIPESTATUS[0]}"; }
# sf_crash kill|raise|pull <args>: the command, with defer-job made to die after it wrote its files (os._exit, or a
# raise), or (pull) the process killed when a pull has written its files but not yet base.json.
sf_crash() { _m=$1; shift; ( cd "$SF" && XDG_CONFIG_HOME="$SFX" python3 - "$_m" "$@" <<'PY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("workflow_engine", __import__("os").environ["ENG"])
mod = importlib.util.module_from_spec(spec)
sys.modules["workflow_engine"] = mod
spec.loader.exec_module(mod)
agenda, cloud = sys.modules["wf_agenda"], sys.modules["wf_cloud"]  # the parts the engine imported
mode, real = sys.argv[1], agenda.defer_job
def crash(args):
    real(args)
    if mode == "kill":
        os._exit(9)
    raise RuntimeError("a crash in the middle of the command")
agenda.defer_job = crash
if mode == "pull":
    cloud.CloudSession.save_base = lambda self: os._exit(9)
sys.exit(mod.main(sys.argv[2:]))
PY
) >> "$SF_OUT" 2>&1; }
# The whole workflow tree's sha list (.git aside), to prove a refusal changed nothing.
sf_tree() { python3 - "$SF/.sikstack" <<'PY'
import hashlib, os, sys
root = sys.argv[1]
for d, dirs, files in sorted(os.walk(root)):
    dirs[:] = sorted(x for x in dirs if not (d == root and x == ".git"))
    for f in sorted(files):
        p = os.path.join(d, f)
        print(os.path.relpath(p, root), hashlib.sha256(open(p, "rb").read()).hexdigest())
PY
}
{ mkhost "$SF" \
  && ( cd "$SF" && python3 "$ENG" phase new --phase P1 --name One --objective toy ); } > "$SFW/setup.txt" 2>&1 \
  || bad "cloud safety probe: the install failed -- $(tail -3 "$SFW/setup.txt")"
SFK="cloud-smoke-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s\n' "$SFK" > "$SFW/key"; chmod 600 "$SFW/key"
python3 "$REPO_ROOT/tests/fake_hi2vi.py" --dir "$SFW/fake" --port-file "$SFW/port" --key-file "$SFW/key" \
  --project proj-1 --org org-1 --lifetime 600 > "$SFW/fake.txt" 2>&1 &
SF_PID=$!
for _ in $(seq 1 100); do [ -s "$SFW/port" ] && break; sleep 0.1; done
SFS="http://127.0.0.1:$(cat "$SFW/port" 2>/dev/null)"
mkdir -p "$SF/.sikstack/.hi2vi" "$SFX/sikstack" && chmod 700 "$SFX/sikstack" && set_link "$SF/.sikstack" "$SFS"
python3 - "$SFX/sikstack/workspace-keys.json" "$SFS" "$SFW/key" <<'PY' || bad "cloud safety probe: could not write the link"
import json, os, sys
keys, server, keyfile = sys.argv[1:]
with open(keyfile) as f:
    key = f.read().strip()
fd = os.open(keys, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump({server: {"proj-1": {"key": key}}}, f)
PY
sf_ctl() { python3 - "$SFS" "$1" <<'PY'
import http.client, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("POST", "/_fake/control", sys.argv[2], {"Content-Type": "application/json"})
assert conn.getresponse().status == 200
PY
}
# sf_put <path> <file>: another checkout writes <file>'s text to <path> in hi2vi.
sf_put() { python3 - "$SFS" "$1" "$2" <<'PY' || bad "cloud safety probe: the fake write failed"
import http.client, json, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("POST", "/_fake/write", json.dumps({"path": sys.argv[2], "content": open(sys.argv[3]).read()}), {"Content-Type": "application/json"})
assert conn.getresponse().status == 200
PY
}
sf_mark() { if [ -f "$SFW/fake/requests.jsonl" ]; then grep -c '' "$SFW/fake/requests.jsonl"; else echo 0; fi; }
# sf_check <mark> <check> [args]: one named assertion over the fake's requests since <mark>, its records, base.json,
# the journal and the disk.
sf_check() { python3 - "$SFW/fake/requests.jsonl" "$SFS" "$SF/.sikstack" "$@" <<'PY'
import base64, hashlib, http.client, json, sys
from pathlib import Path
from urllib.parse import urlparse, quote
log, server, root, mark, check, extra = sys.argv[1], sys.argv[2], Path(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6:]
R = [json.loads(l) for l in (Path(log).read_text().splitlines() if Path(log).exists() else [])[mark:]]
C = [r for r in R if r["path"].endswith("/commit")]
u = urlparse(server)
def get(path):
    conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
    conn.request("GET", path)
    resp = conn.getresponse()
    return resp.status, json.loads(resp.read())
S = get("/_fake/state")[1]
base = json.loads((root / ".hi2vi/base.json").read_text()) if (root / ".hi2vi/base.json").exists() else {}
journal = json.loads((root / ".hi2vi/journal.json").read_text()) if (root / ".hi2vi/journal.json").exists() else None
live = {p: f for p, f in S["files"].items() if not f["deleted"]}
def sha(p):
    return hashlib.sha256((root / p).read_bytes()).hexdigest()
def need(cond, why):
    if not cond:
        print(why)
        sys.exit(1)
def synced():
    """base.json, hi2vi and the disk agree: the head, every record's rev, every file's sha, the event log's bytes."""
    outbox = root / ".hi2vi/outbox"
    need(journal is None and (not outbox.exists() or not any(outbox.iterdir())), f"the journal or the outbox is left: {journal}")
    need(base.get("head") == S["head"], f"base head {base.get('head')} != hi2vi head {S['head']}")
    need(set(base["files"]) == set(live), f"base and hi2vi hold different paths: {sorted(set(base['files']) ^ set(live))[:4]}")
    for p, f in live.items():
        need(base["files"][p]["rev"] == f["rev"], f"{p}: base rev {base['files'][p]['rev']} != hi2vi rev {f['rev']}")
        need((root / p).is_file() and sha(p) == f["sha256"], f"{p}: the disk differs from hi2vi")
if check == "first":
    need(len(C) == 1 and C[0]["status"] == 200, f"one first batch expected: {[c['status'] for c in C]}")
    synced()
elif check == "lost":  # extra: revisions before the command
    need(len(C) == 1 and str(C[0]["status"]).startswith("drop-after"), f"the commit's answer was not lost: {[c['status'] for c in C]}")
    need(journal is not None and journal.get("state") == "pushing" and journal.get("batches") == [C[0]["batch"]["batch_id"]],
         f"the journal does not name the lost batch: {journal}")
    need(S["revisions"] > int(extra[0]), "the batch did not land in hi2vi")
elif check == "unsent":  # extra: revisions before the command
    need(len(C) == 1 and C[0]["status"] == "drop-before", f"the commit was not dropped: {[c['status'] for c in C]}")
    need(journal is not None and journal.get("state") == "pushing" and journal.get("batches") == [C[0]["batch"]["batch_id"]],
         f"the journal does not name the unsent batch: {journal}")
    need(S["revisions"] == int(extra[0]), "a dropped batch landed")
elif check == "resent":  # extra: the batch id, revisions after it landed (or before, for a batch never applied), replay
    bid, revs, replay = extra[0], int(extra[1]), extra[2] == "replay"
    need(C and C[0]["batch"]["batch_id"] == bid and C[0]["status"] == 200 and C[0]["batch"]["replay"] == replay,
         f"the next command did not resend batch {bid} first: {[(c['batch']['batch_id'], c['status'], c['batch']['replay']) for c in C]}")
    need((S["revisions"] == revs) if replay else (S["revisions"] > revs), f"the batch landed twice or never: {S['revisions']} vs {revs}")
    synced()
elif check == "interrupted":  # extra: the crash's class or -
    need(journal is not None and journal.get("state") == "running" and journal.get("command", "").startswith("defer-job"),
         f"the journal is not running defer-job: {journal}")
    need((journal.get("crashed") == extra[0]) if extra[0] != "-" else "crashed" not in journal, f"crashed: {journal.get('crashed')}")
    need(not C, "a crashed command sent a batch")
elif check == "stale":  # extra: the path, revisions and head before, the cloud's content
    path, revs, head, cloud = extra[0], int(extra[1]), int(extra[2]), extra[3]
    need(len(C) == 1 and C[0]["status"] == 409, f"one refused batch expected: {[c['status'] for c in C]}")
    need(S["head"] == head + 1 and S["revisions"] == revs + 1, f"hi2vi wrote more than the other checkout's change: {S['head']} {S['revisions']}")
    content = base64.b64decode(get("/_fake/file?path=" + quote(path))[1]["content"]).decode()
    need(content == cloud, "hi2vi's copy is not the other checkout's")
    need("changed here" in (root / path).read_text(), "the disk lost this checkout's change")
    need(base["files"][path]["sha256"] != sha(path), "base.json no longer names the unsent change")
    need(journal is None, f"a refused batch left the journal: {journal}")
elif check == "serialized":
    need(len(C) == 2 and all(c["status"] == 200 and not c["batch"]["replay"] for c in C), f"two landed batches expected: {[(c['status'], c['batch']['replay']) for c in C]}")
    heads = [r for r in R if r["path"].endswith("/head")]
    need(len(heads) == 2, f"each process asks head once: {len(heads)}")
    dj = sorted(p for p in live if p.endswith("/deferred.json"))
    need(dj == sorted(str(p.relative_to(root)) for p in (root / "works/deferred/open").glob("*/deferred.json")), "hi2vi lacks a deferred job")
    synced()
elif check == "split":  # extra: the number of big files
    need(len(C) >= 2 and all(c["status"] == 200 for c in C), f"several landed batches expected: {[(c['status'], c.get('bytes')) for c in C]}")
    need(all(0 < c["bytes"] < 8_000_000 for c in C), f"a batch over 8,000,000 B: {[c.get('bytes') for c in C]}")
    need(len({c["batch"]["batch_id"] for c in C}) == len(C), "two batches shared a batch_id")
    need(len([p for p in live if "/topics/big-" in p]) == int(extra[0]), "a big file is missing in hi2vi")
    synced()
elif check == "toobig":
    need(not C, f"a batch was sent: {[(c['status'], c.get('bytes')) for c in C]}")
    need(journal is None, f"the journal is left: {journal}")
elif check == "synced":
    synced()
elif check == "once":  # extra: the append-only paths (comma-separated), then marks each once in hi2vi
    import collections
    need(journal is None and base.get("head") == S["head"], f"not settled: journal {journal}, base head {base.get('head')} vs {S['head']}")
    cloud_lines = []
    for p in extra[0].split(","):
        c = base64.b64decode(get("/_fake/file?path=" + quote(p))[1]["content"]).decode().splitlines()
        d = (root / p).read_text().splitlines()
        twice = sorted(l for l, n in collections.Counter(c).items() if n > 1)
        need(not twice, f"{p}: hi2vi holds {len(twice)} line(s) twice, first {twice[:1]}")
        need(collections.Counter(c) == collections.Counter(d), f"{p}: the disk's lines and hi2vi's differ")
        cloud_lines += c
    for mark in extra[1:]:
        n = sum(mark in l for l in cloud_lines)
        need(n == 1, f"{mark}: {n} line(s) in hi2vi, not 1")
print("ok")
PY
}
sf_revs() { python3 - "$SFS" "$1" <<'PY'
import http.client, json, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("GET", "/_fake/state")
print(json.loads(conn.getresponse().read())[sys.argv[2]])
PY
}
sf_m=$(sf_mark); sf next >/dev/null; sf_r=$(sf_check "$sf_m" first)
[ "$sf_r" = ok ] || bad "cloud safety probe: the first sync failed -- $sf_r"
# (a) offline: the begin step's P1 fails, so the command never runs: exit 1, one line, the tree unchanged.
sf_ctl '{"offline": true}'
sf_t1=$(sf_tree); sf defer-job --title off --reason r --trigger t --source manual > "$SFW/a.txt"; sf_rc=$?; sf_t2=$(sf_tree)
[ "$sf_rc" = 1 ] && [ "$(grep -c '' "$SFW/a.txt")" = 1 ] && [ "$sf_t1" = "$sf_t2" ] \
  && grep -qE '^hi2vi is not reachable at http://127\.0\.0\.1:[0-9]+ \(.+\): in cloud mode nothing runs offline, and nothing was changed\.$' "$SFW/a.txt" \
  && ok "offline: defer-job is refused before it runs with exit 1 and P8's one line, and the workflow tree's sha list is equal before and after" \
  || bad "offline refusal wrong -- rc=$sf_rc $(head -3 "$SFW/a.txt") $(diff <(echo "$sf_t1") <(echo "$sf_t2") | head -3)"
echo '{}' | sf compact-resume > "$SFW/a2.txt"; sf_rc=$?
[ "$sf_rc" = 0 ] && grep -q '^compaction=done' "$SFW/a2.txt" && grep -qE '^note: hi2vi is not reachable at ' "$SFW/a2.txt" \
  && ok "offline: compact-resume (the session hook) fails open: exit 0, the resume card from the disk, P8's line as a note" \
  || bad "compact-resume offline did not fail open -- rc=$sf_rc $(head -3 "$SFW/a2.txt")"
sf_ctl '{"offline": false}'
# (b) a crash after the push landed and before the base was updated (the answer lost): the next command resends the
# same batch_id first, hi2vi answers it once (a replay), and base.json, hi2vi and the disk agree.
sf_ctl '{"commit": "drop-after"}'; sf_v=$(sf_revs revisions); sf_m=$(sf_mark)
sf defer-job --title lost --reason r --trigger t --source manual > "$SFW/b.txt"; sf_rc=$?
sf_r=$(sf_check "$sf_m" lost "$sf_v"); sf_bid=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["batches"][0])' "$SF/.sikstack/.hi2vi/journal.json" 2>/dev/null)
sf_v=$(sf_revs revisions); sf_m=$(sf_mark); sf next > "$SFW/b2.txt"; sf_rc2=$?; sf_r2=$(sf_check "$sf_m" resent "$sf_bid" "$sf_v" replay)
[ "$sf_rc" = 1 ] && tail -1 "$SFW/b.txt" | grep -q '^this change is on disk but not in hi2vi (hi2vi unreachable: .*): run sync$' \
  && [ "$sf_r" = ok ] && [ "$sf_rc2" = 0 ] && [ "$sf_r2" = ok ] \
  && ok "a lost commit answer: the command exits 1 (on disk but not in hi2vi), the journal names the batch, the next command resends the same batch_id, hi2vi replays it (the revisions land once) and the base catches up" \
  || bad "the lost-answer row wrong -- rc=$sf_rc/$sf_rc2 $sf_r / $sf_r2 / $(tail -1 "$SFW/b.txt")"
# (c) a crash before the push landed (the batch never applied): the next command sends it, and it lands now.
sf_ctl '{"commit": "drop-before"}'; sf_v=$(sf_revs revisions); sf_m=$(sf_mark)
sf defer-job --title unsent --reason r --trigger t --source manual > "$SFW/c.txt"; sf_rc=$?
sf_r=$(sf_check "$sf_m" unsent "$sf_v"); sf_bid=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["batches"][0])' "$SF/.sikstack/.hi2vi/journal.json" 2>/dev/null)
sf_m=$(sf_mark); sf next > "$SFW/c2.txt"; sf_rc2=$?; sf_r2=$(sf_check "$sf_m" resent "$sf_bid" "$sf_v" first)
[ "$sf_rc" = 1 ] && [ "$sf_r" = ok ] && [ "$sf_rc2" = 0 ] && [ "$sf_r2" = ok ] \
  && ok "a batch that never landed: the journal keeps it, the next command sends that batch_id and it lands once" \
  || bad "the unsent row wrong -- rc=$sf_rc/$sf_rc2 $sf_r / $sf_r2"
# (d) a crash during the command (a hard exit, then a raise): the journal stays running, and the next command refuses
# with one line naming sync and changes nothing. (sync is the way out; here the journal is removed by hand instead.)
sf_m=$(sf_mark); sf_crash kill defer-job --title killed --reason r --trigger t --source manual; sf_rc=$?
sf_r=$(sf_check "$sf_m" interrupted -)
sf_t1=$(sf_tree); sf next > "$SFW/d.txt"; sf_rc2=$?; sf_t2=$(sf_tree)
[ "$sf_rc" = 9 ] && [ "$sf_r" = ok ] && [ "$sf_rc2" = 1 ] && [ "$(grep -c '' "$SFW/d.txt")" = 1 ] && [ "$sf_t1" = "$sf_t2" ] \
  && grep -qE '^the last command here \(defer-job --title killed .*\) stopped before it finished: [0-9]+ file\(s\) changed by it are on disk but not in hi2vi \(interrupted\): run sync to see them \(nothing was changed\)$' "$SFW/d.txt" \
  && ok "a command killed midway leaves the journal running; the next command is refused with one line naming sync, and the tree is unchanged" \
  || bad "the interrupted row (kill) wrong -- rc=$sf_rc/$sf_rc2 $sf_r / $(head -2 "$SFW/d.txt")"
rm -f "$SF/.sikstack/.hi2vi/journal.json"; sf next >/dev/null
sf_m=$(sf_mark); sf_crash raise defer-job --title raised --reason r --trigger t --source manual; sf_rc=$?
sf_r=$(sf_check "$sf_m" interrupted RuntimeError); sf next > "$SFW/d2.txt"; sf_rc2=$?
[ "$sf_rc" = 1 ] && [ "$sf_r" = ok ] && [ "$sf_rc2" = 1 ] && grep -qF 'stopped before it finished, RuntimeError: ' "$SFW/d2.txt" \
  && ok "a command that raises (not a refusal) sends nothing, its journal names the crash, and the next command refuses naming it and sync" \
  || bad "the interrupted row (raise) wrong -- rc=$sf_rc/$sf_rc2 $sf_r / $(head -2 "$SFW/d2.txt")"
rm -f "$SF/.sikstack/.hi2vi/journal.json"; sf next >/dev/null
# The crash table's last row: killed during a pull, after the file was written and before base.json was. The disk's
# sha equals hi2vi's, which reads as the same: the next command is not refused and the base is fixed.
printf 'renamed in hi2vi\n' > "$SFW/pulled.md"; sf_put works/phases/active/P1/intent.md "$SFW/pulled.md"
sf_crash pull next; sf_rc=$?
cmp -s "$SFW/pulled.md" "$SF/.sikstack/works/phases/active/P1/intent.md"; sf_w=$?
sf_m=$(sf_mark); sf next > "$SFW/d3.txt"; sf_rc2=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 9 ] && [ "$sf_w" = 0 ] && [ "$sf_rc2" = 0 ] && [ "$sf_r" = ok ] \
  && ok "a pull killed after its write and before base.json: the next command reads the file as the same (no mismatch) and the base catches up" \
  || bad "the pull-crash row wrong -- rc=$sf_rc/$sf_rc2 written=$sf_w $sf_r / $(tail -1 "$SFW/d3.txt")"
# The crash table's append rows. A pull merges another checkout's new lines into an append-only file (the event log)
# around the lines this checkout has not sent yet, so the merged file differs from
# hi2vi's and never reads as the same. Killed at any step of that pull, the next command sends only this checkout's own
# lines: hi2vi holds each line exactly once.
# sf_kill fetch|write|wrote|base <path> <args>: the command, killed (os._exit) once the pull has fetched <path>, just
# before or just after the pull writes it, or once base.json is saved (before the generated files are rebuilt).
sf_kill() { _s=$1; _f=$2; shift 2; ( cd "$SF" && XDG_CONFIG_HOME="$SFX" python3 - "$_s" "$_f" "$@" <<'PY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("workflow_engine", __import__("os").environ["ENG"])
mod = importlib.util.module_from_spec(spec)
sys.modules["workflow_engine"] = mod
spec.loader.exec_module(mod)
cloud = sys.modules["wf_cloud"]  # the cloud part the engine imported
step, target = sys.argv[1], sys.argv[2]
real_write, real_fetch = cloud._cloud_write_bytes, cloud.CloudSession.fetch
def write(path, data):
    hit = str(path).endswith("/" + target)
    if hit and step == "write":
        os._exit(9)
    real_write(path, data)
    if hit and step == "wrote":
        os._exit(9)
def fetch(self, paths):
    got = real_fetch(self, paths)
    if step == "fetch" and target in got:
        os._exit(9)
    return got
cloud._cloud_write_bytes, cloud.CloudSession.fetch = write, fetch
if step == "base":
    cloud.cloud_rebuild = lambda rels: os._exit(9)
sys.exit(mod.main(sys.argv[3:]))
PY
) >> "$SF_OUT" 2>&1; }
# sf_add <path> <line>...: another checkout appends these lines to <path> in hi2vi.
sf_add() { python3 - "$SFS" "$@" <<'PY' || bad "cloud safety probe: the fake append failed"
import http.client, json, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("POST", "/_fake/write", json.dumps({"path": sys.argv[2], "lines": sys.argv[3:]}), {"Content-Type": "application/json"})
assert conn.getresponse().status == 200
PY
}
sf_ev=works/events.jsonl; sf_bad=""
for sf_step in fetch write wrote base; do
  printf '{"type": "smoke_local", "mark": "local-%s"}\n' "$sf_step" >> "$SF/.sikstack/$sf_ev"
  sf_add "$sf_ev" "{\"type\": \"agenda_added\", \"agenda\": \"cloud-$sf_step\"}"
  sf_kill "$sf_step" "$sf_ev" next; sf_rc=$?
  sf_m=$(sf_mark); sf next >/dev/null; sf_rc2=$?; sf_r=$(sf_check "$sf_m" once "$sf_ev" "\"local-$sf_step\"" "\"cloud-$sf_step\"")
  { [ "$sf_rc" = 9 ] && [ "$sf_rc2" = 0 ] && [ "$sf_r" = ok ]; } || sf_bad="$sf_bad [$sf_step: rc=$sf_rc/$sf_rc2 $sf_r]"
done
[ -z "$sf_bad" ] \
  && ok "a pull merging another checkout's event line around a local one, killed after the fetch, before the write, after the write (before base.json) or after base.json: the next command sends only the local line, and hi2vi holds each line once" \
  || bad "an append pull killed midway re-sent hi2vi's own lines --$sf_bad"
sf_add "$sf_ev" '{"type": "agenda_added", "agenda": "cloud-alone"}'
sf_kill wrote "$sf_ev" next; sf_rc=$?
sf_m=$(sf_mark); sf next >/dev/null; sf_rc2=$?; sf_r=$(sf_check "$sf_m" once "$sf_ev" '"cloud-alone"'); sf_r2=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 9 ] && [ "$sf_rc2" = 0 ] && [ "$sf_r" = ok ] && [ "$sf_r2" = ok ] \
  && ok "an append pull with nothing local past the offset, killed after its write: the file equals hi2vi's, reads as the same, and the base catches up" \
  || bad "the plain append pull-crash row wrong -- rc=$sf_rc/$sf_rc2 $sf_r / $sf_r2"
# A local order that already differs from hi2vi's (another checkout's line landed between this checkout's pull and its
# push): the file never equals hi2vi's again, so a pull killed after its write must still send nothing of hi2vi's.
printf '{"type": "smoke_local", "mark": "local-race"}\n' >> "$SF/.sikstack/$sf_ev"
sf_ctl "$(python3 -c 'import json, sys; print(json.dumps({"race": {"path": sys.argv[1], "lines": [json.dumps({"type": "agenda_added", "agenda": "cloud-race"})]}}))' "$sf_ev")"
sf next >/dev/null; sf next >/dev/null
sf_ord=$(python3 - "$SFS" "$SF/.sikstack" "$sf_ev" <<'PY'
import base64, http.client, json, sys
from pathlib import Path
from urllib.parse import urlparse, quote
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("GET", "/_fake/file?path=" + quote(sys.argv[3]))
c = base64.b64decode(json.loads(conn.getresponse().read())["content"])
d = (Path(sys.argv[2]) / sys.argv[3]).read_bytes()
print("differs" if c != d and sorted(c.splitlines()) == sorted(d.splitlines()) else "same")
PY
)
sf_add "$sf_ev" '{"type": "agenda_added", "agenda": "cloud-order"}'
sf_kill wrote "$sf_ev" next; sf_rc=$?
sf_m=$(sf_mark); sf next >/dev/null; sf_rc2=$?; sf_r=$(sf_check "$sf_m" once "$sf_ev" '"cloud-order"' '"cloud-race"' '"local-race"')
[ "$sf_ord" = differs ] && [ "$sf_rc" = 9 ] && [ "$sf_rc2" = 0 ] && [ "$sf_r" = ok ] \
  && ok "an event log whose order already differs from hi2vi's, its pull killed after the write: the next command sends nothing of hi2vi's, each line once" \
  || bad "the differing-order append pull-crash row wrong -- order=$sf_ord rc=$sf_rc/$sf_rc2 $sf_r"
sf sync --keep cloud "$sf_ev" >/dev/null; sf_m=$(sf_mark); sf next >/dev/null; sf_rc=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_r" = ok ] || bad "the event log did not settle on hi2vi's order after sync --keep cloud -- rc=$sf_rc $sf_r"
# (e) a stale write: another checkout changes the same file between this command's begin and its commit. hi2vi refuses
# the whole batch (409), the disk keeps this checkout's change, exit 1 though next succeeded; then the begin step's
# mismatch refuses with nothing changed, until the two sides agree.
sf_p=works/phases/active/P1/intent.md; printf 'changed here\n' >> "$SF/.sikstack/$sf_p"
sf_ctl "{\"race\": {\"path\": \"$sf_p\", \"content\": \"changed in hi2vi by another checkout\\n\"}}"
sf_v=$(sf_revs revisions); sf_h=$(sf_revs head); sf_m=$(sf_mark)
sf next > "$SFW/e.txt"; sf_rc=$?; sf_r=$(sf_check "$sf_m" stale "$sf_p" "$sf_v" "$sf_h" "changed in hi2vi by another checkout
")
[ "$sf_rc" = 1 ] && [ "$(tail -1 "$SFW/e.txt")" = "this change is on disk but not in hi2vi (1 conflict(s)): run sync" ] && [ "$sf_r" = ok ] \
  && ok "a stale write is refused: 409, nothing of the batch written in hi2vi, the disk keeps the change, base.json still names it, no journal left, and exit 1 though next itself succeeded" \
  || bad "the stale write wrong -- rc=$sf_rc $sf_r / $(tail -1 "$SFW/e.txt")"
sf_t1=$(sf_tree); sf next > "$SFW/e2.txt"; sf_rc=$?; sf_t2=$(sf_tree)
[ "$sf_rc" = 1 ] && [ "$(cat "$SFW/e2.txt")" = "1 files differ between this checkout and hi2vi: run sync to see them (nothing was changed)" ] && [ "$sf_t1" = "$sf_t2" ] \
  && ok "then the begin step's mismatch: the next command is refused with one line naming sync, and the tree is unchanged" \
  || bad "the mismatch refusal wrong -- rc=$sf_rc $(head -2 "$SFW/e2.txt")"
sf_put "$sf_p" "$SF/.sikstack/$sf_p"
sf_m=$(sf_mark); sf next >/dev/null; sf_rc=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_r" = ok ] || bad "equal content on both sides did not clear the mismatch -- rc=$sf_rc $sf_r"
# (f) two engine processes in one checkout at once. The fake holds the first two head requests until both arrive (or
# 3 s pass), so without the lock both would begin at the same head and base and race (a double push of the event
# lines, a lost base). The lock serializes them: each batch lands once and base.json, hi2vi and the disk agree.
sf_ctl '{"gate": {"route": "head", "count": 2, "timeout": 3}}'; sf_m=$(sf_mark)
sf defer-job --title one --reason r --trigger t --source manual > "$SFW/f1.txt" & sf_p1=$!
sf defer-job --title two --reason r --trigger t --source manual > "$SFW/f2.txt" & sf_p2=$!
wait "$sf_p1"; sf_rc=$?; wait "$sf_p2"; sf_rc2=$?
sf_ctl '{"gate": null}'; sf_r=$(sf_check "$sf_m" serialized)
[ "$sf_rc" = 0 ] && [ "$sf_rc2" = 0 ] && [ "$sf_r" = ok ] \
  && ok "two defer-job processes at once in one checkout are serialized by .hi2vi/lock: two batches, none resent, both jobs in hi2vi, and the event log, every rev and base.json's head agree" \
  || bad "two engine processes were not serialized -- rc=$sf_rc/$sf_rc2 $sf_r / $(tail -1 "$SFW/f1.txt") / $(tail -1 "$SFW/f2.txt")"
# compact-resume while another process holds the lock: it waits a bounded time, then fails open with the line as a note.
python3 -c 'import fcntl, os, sys, time
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT); fcntl.flock(fd, fcntl.LOCK_EX); open(sys.argv[2], "w").close(); time.sleep(20)' \
  "$SF/.sikstack/.hi2vi/lock" "$SFW/held" & sf_hp=$!
for _ in $(seq 1 100); do [ -e "$SFW/held" ] && break; sleep 0.1; done
sf_s=$(date +%s); echo '{}' | sf compact-resume > "$SFW/f3.txt"; sf_rc=$?; sf_s=$(( $(date +%s) - sf_s ))
kill "$sf_hp" 2>/dev/null; wait "$sf_hp" 2>/dev/null
[ "$sf_rc" = 0 ] && [ "$sf_s" -lt 15 ] && grep -q '^compaction=done' "$SFW/f3.txt" && grep -qF "note: another engine command has held this checkout's lock" "$SFW/f3.txt" \
  && ok "compact-resume with the lock held elsewhere waits a bounded time (${sf_s}s), then fails open: exit 0, the card, the lock line as a note" \
  || bad "compact-resume did not fail open on a held lock -- rc=$sf_rc ${sf_s}s $(head -3 "$SFW/f3.txt")"
# (g) a change over the server's limit goes as several batches in order, each under 8,000,000 B as sent with its own
# batch_id; one file too big for any batch is refused before anything is sent.
mkdir -p "$SF/.sikstack/works/phases/active/P1/topics"
for i in 1 2 3; do python3 -c 'import sys; open(sys.argv[1], "w").write(("line of a big topic %s\n" % sys.argv[2]) * 140000)' \
  "$SF/.sikstack/works/phases/active/P1/topics/big-$i.md" "$i"; done
sf_m=$(sf_mark); sf next >/dev/null; sf_rc=$?; sf_r=$(sf_check "$sf_m" split 3)
[ "$sf_rc" = 0 ] && [ "$sf_r" = ok ] \
  && ok "a 9 MB change goes as several batches in order, each under 8,000,000 B as sent with its own batch_id, and all of it lands" \
  || bad "the big change was not split -- rc=$sf_rc $sf_r"
python3 -c 'import sys; open(sys.argv[1], "w").write("x" * 8100000)' "$SF/.sikstack/works/phases/active/P1/topics/huge.md"
sf_m=$(sf_mark); sf next > "$SFW/g.txt"; sf_rc=$?; sf_r=$(sf_check "$sf_m" toobig)
[ "$sf_rc" = 1 ] && [ "$sf_r" = ok ] && tail -1 "$SFW/g.txt" | grep -qE "^works/phases/active/P1/topics/huge\.md is [0-9,]+ bytes as sent, over hi2vi's 8,000,000-byte batch limit: it is on disk but not in hi2vi" \
  && ok "one file too big for any batch is refused with one line naming it, exit 1, nothing sent" \
  || bad "the too-big file was not refused -- rc=$sf_rc $sf_r / $(tail -1 "$SFW/g.txt")"
rm -f "$SF/.sikstack/works/phases/active/P1/topics/huge.md"
sf_m=$(sf_mark); sf next >/dev/null; sf_rc=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_r" = ok ] || bad "the checkout did not settle after the too-big file left -- rc=$sf_rc $sf_r"
# (i) every failure inside the boundary ends in one line, never a traceback: a cut or malformed answer (http.client's
# IncompleteRead, BadStatusLine, LineTooLong) refuses the command with P8's line and the tree unchanged, and the
# session hook still prints its card with the line as a note.
sf_no_tb() { ! grep -q '^Traceback' "$1"; }
for sf_how in truncate:IncompleteRead status:BadStatusLine longline:LineTooLong; do
  sf_ctl "{\"break\": {\"route\": \"head\", \"how\": \"${sf_how%%:*}\"}}"
  sf_t1=$(sf_tree); sf next > "$SFW/i.txt"; sf_rc=$?; sf_t2=$(sf_tree)
  echo '{}' | sf compact-resume > "$SFW/i2.txt"; sf_rc2=$?
  sf_ctl '{"break": null}'
  [ "$sf_rc" = 1 ] && [ "$(grep -c '' "$SFW/i.txt")" = 1 ] && [ "$sf_t1" = "$sf_t2" ] \
    && grep -qE "^hi2vi is not reachable at http://127\.0\.0\.1:[0-9]+ \(${sf_how#*:}.*\): in cloud mode nothing runs offline, and nothing was changed\.$" "$SFW/i.txt" \
    && [ "$sf_rc2" = 0 ] && grep -q '^compaction=done' "$SFW/i2.txt" && grep -qE "^note: hi2vi is not reachable at .*\(${sf_how#*:}" "$SFW/i2.txt" && sf_no_tb "$SFW/i2.txt" \
    && ok "an answer cut or malformed at the begin step (${sf_how#*:}): the command is refused with P8's one line and the tree unchanged, and compact-resume prints its card with the line as a note, exit 0" \
    || bad "a ${sf_how#*:} at the begin step was not one line -- rc=$sf_rc/$sf_rc2 $(head -2 "$SFW/i.txt") / $(tail -2 "$SFW/i2.txt")"
done
# The answers that were already one line stay so: a proxy's 502 in front of a stopped API, a body that is not JSON.
sf_bad=""
for sf_how in "bad-gateway:^hi2vi is not reachable at .* \(HTTP 502 on head\): in cloud mode nothing runs offline, and nothing was changed\.$" \
              "garbage:^hi2vi answered for project None, not proj-1: this checkout's link is broken, and nothing was changed$"; do
  sf_ctl "{\"break\": {\"route\": \"head\", \"how\": \"${sf_how%%:*}\"}}"
  sf next > "$SFW/i0.txt"; sf_rc=$?; sf_ctl '{"break": null}'
  { [ "$sf_rc" = 1 ] && [ "$(grep -c '' "$SFW/i0.txt")" = 1 ] && grep -qE "${sf_how#*:}" "$SFW/i0.txt"; } || sf_bad="$sf_bad [${sf_how%%:*}: rc=$sf_rc $(head -1 "$SFW/i0.txt")]"
done
[ -z "$sf_bad" ] && ok "a 502 from a proxy and a body that is not JSON still end in their one line, exit 1" || bad "a 502 or a non-JSON answer --$sf_bad"
# A commit answer cut mid-body is a lost answer: one line, the journal keeps the batch, the next command resends it.
sf_ctl '{"break": {"route": "commit", "how": "truncate"}}'
sf defer-job --title cut --reason r --trigger t --source manual > "$SFW/i3.txt"; sf_rc=$?
sf_ctl '{"break": null}'; sf_m=$(sf_mark); sf next >/dev/null; sf_rc2=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 1 ] && sf_no_tb "$SFW/i3.txt" && [ "$(tail -1 "$SFW/i3.txt")" != "" ] \
  && tail -1 "$SFW/i3.txt" | grep -q '^this change is on disk but not in hi2vi (hi2vi unreachable: IncompleteRead(.*)): run sync$' \
  && [ "$sf_rc2" = 0 ] && [ "$sf_r" = ok ] \
  && ok "a commit answer cut mid-body: the command exits 1 with the one on-disk line, and the next command resends the batch and settles" \
  || bad "a cut commit answer wrong -- rc=$sf_rc/$sf_rc2 $sf_r / $(tail -2 "$SFW/i3.txt")"
# A fetch whose base64 does not decode stops the pull before anything is written.
printf 'pulled as base64\n' > "$SFW/b64.md"; sf_put works/phases/active/P1/topics/b64.md "$SFW/b64.md"
sf_ctl '{"break": {"route": "fetch", "how": "badbase64"}}'
sf_t1=$(sf_tree); sf next > "$SFW/i4.txt"; sf_rc=$?; sf_t2=$(sf_tree)
echo '{}' | sf compact-resume > "$SFW/i5.txt"; sf_rc2=$?
sf_ctl '{"break": null}'; sf_m=$(sf_mark); sf next >/dev/null; sf_rc3=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 1 ] && [ "$(grep -c '' "$SFW/i4.txt")" = 1 ] && [ "$sf_t1" = "$sf_t2" ] \
  && grep -qE '^hi2vi is not reachable at .* \(a fetched file did not decode as base64: works/phases/active/P1/topics/b64\.md\): in cloud mode nothing runs offline, and nothing was changed\.$' "$SFW/i4.txt" \
  && [ "$sf_rc2" = 0 ] && grep -q '^compaction=done' "$SFW/i5.txt" && grep -q '^note: hi2vi is not reachable at .*did not decode as base64' "$SFW/i5.txt" \
  && [ "$sf_rc3" = 0 ] && [ "$sf_r" = ok ] \
  && ok "a fetch whose base64 does not decode: one line naming the file, nothing written, the hook's note; the next good answer pulls it" \
  || bad "bad base64 in a fetch wrong -- rc=$sf_rc/$sf_rc2/$sf_rc3 $sf_r / $(head -2 "$SFW/i4.txt") / $(tail -1 "$SFW/i5.txt")"
# A write error during the pull (a file stands where hi2vi's folder goes): one line naming the path; the file pulled
# before it is on disk and recorded in base.json with the head kept, and once the way is clear the pull resumes.
printf 'pulled first\n' > "$SFW/pa.md"; printf 'pulled second\n' > "$SFW/pb.md"
sf_put works/phases/active/P1/topics/a-first.md "$SFW/pa.md"; sf_put works/phases/active/P1/topics/blocked/b.md "$SFW/pb.md"
printf 'in the way\n' > "$SF/.sikstack/works/phases/active/P1/topics/blocked"
sf_h0=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["head"])' "$SF/.sikstack/.hi2vi/base.json")
sf next > "$SFW/i6.txt"; sf_rc=$?
sf_rec=$(python3 - "$SF/.sikstack" "$sf_h0" <<'PY'
import hashlib, json, sys
from pathlib import Path
root, h0 = Path(sys.argv[1]), int(sys.argv[2])
base = json.loads((root / ".hi2vi/base.json").read_text())
a = "works/phases/active/P1/topics/a-first.md"
ok = (base["head"] == h0 and base["files"].get(a, {}).get("sha256") == hashlib.sha256((root / a).read_bytes()).hexdigest()
      and "works/phases/active/P1/topics/blocked/b.md" not in base["files"] and not (root / ".hi2vi/journal.json").exists())
print("ok" if ok else f"base {base['head']} vs {h0}: {base['files'].get(a)}")
PY
)
echo '{}' | sf compact-resume > "$SFW/i7.txt"; sf_rc2=$?
rm -f "$SF/.sikstack/works/phases/active/P1/topics/blocked"; sf_m=$(sf_mark); sf next >/dev/null; sf_rc3=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 1 ] && [ "$(grep -c '' "$SFW/i6.txt")" = 1 ] && [ "$sf_rec" = ok ] \
  && grep -qE '^works/phases/active/P1/topics/blocked/b\.md could not be written here from hi2vi \([A-Za-z]+Error: .*\): 1 pulled path\(s\) landed before it and are recorded in \.hi2vi/base\.json; fix it, then run the command again \(the pull resumes from there\)$' "$SFW/i6.txt" \
  && [ "$sf_rc2" = 0 ] && grep -q '^compaction=done' "$SFW/i7.txt" && grep -q '^note: works/phases/active/P1/topics/blocked/b\.md could not be written' "$SFW/i7.txt" \
  && [ "$sf_rc3" = 0 ] && [ "$sf_r" = ok ] \
  && ok "a write error during a pull: one line naming the path, what landed before it recorded in base.json (the head kept, no journal), the hook's note; then the pull resumes and settles" \
  || bad "a write error during a pull wrong -- rc=$sf_rc/$sf_rc2/$sf_rc3 $sf_rec $sf_r / $(head -2 "$SFW/i6.txt") / $(tail -1 "$SFW/i7.txt")"
# The session hook's budget: a slow but answering server (5 s per answer, a pull waiting: head, manifest and fetch
# would take 15 s), then one that sends a byte a second (no socket read ever times out). compact-resume stays inside
# the hook's 15 s timeout (its cloud time is held to 9 s) and prints its card with the line as a note.
printf 'pulled slowly\n' > "$SFW/slow.md"; sf_put works/phases/active/P1/topics/slow.md "$SFW/slow.md"
for sf_sw in "slow:5:answers each request 5 s late" "drip:1:sends its answers a byte a second"; do
  sf_k=${sf_sw%%:*}; sf_n=${sf_sw#*:}; sf_lbl=${sf_n#*:}; sf_n=${sf_n%%:*}
  sf_ctl "{\"$sf_k\": $sf_n}"
  sf_s=$(date +%s); echo '{}' | sf compact-resume > "$SFW/i8.txt"; sf_rc=$?; sf_s=$(( $(date +%s) - sf_s ))
  sf_ctl "{\"$sf_k\": 0}"
  [ "$sf_rc" = 0 ] && [ "$sf_s" -lt 15 ] && grep -q '^compaction=done' "$SFW/i8.txt" && grep -qF "note: hi2vi is not reachable at $SFS (the session hook's 9 s for hi2vi ran out)" "$SFW/i8.txt" \
    && ok "compact-resume on a server that $sf_lbl ends in ${sf_s}s, inside the hook's 15 s: exit 0, the card, the budget's line as a note" \
    || bad "compact-resume on a server that $sf_lbl -- rc=$sf_rc ${sf_s}s $(tail -2 "$SFW/i8.txt")"
done
sleep 2; sf_m=$(sf_mark); sf next >/dev/null; sf_rc=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_r" = ok ] || bad "the checkout did not settle after the slow server -- rc=$sf_rc $sf_r"
# A request fails when it stalls, never while its bytes still move. On a steady slow link (the fake reads and sends at
# 48,000 B/s) a 624 KB file takes about 13 s to pull and as long to push: a limit on the whole request would refuse
# each. The session hook still stops at its 9 s with the note; an ordinary command pulls and pushes it whole, and a
# batch left `pushing` is resent at the begin step over the same link.
sf_big() { python3 -c 'import sys; open(sys.argv[1], "w").write((sys.argv[2] + " of a slow transfer\n") * 24000)' "$1" "$2"; }
sf_big "$SFW/slowpull.md" pulled; sf_put works/phases/active/P1/topics/slow-pull.md "$SFW/slowpull.md"
sf_ctl '{"rate": 48000}'
sf_s=$(date +%s); echo '{}' | sf compact-resume > "$SFW/s1.txt"; sf_rc=$?; sf_s=$(( $(date +%s) - sf_s ))
[ "$sf_rc" = 0 ] && [ "$sf_s" -lt 15 ] && grep -q '^compaction=done' "$SFW/s1.txt" && grep -qF "note: hi2vi is not reachable at $SFS (the session hook's 9 s for hi2vi ran out)" "$SFW/s1.txt" \
  && ok "compact-resume with a 624 KB pull waiting on a slow link ends in ${sf_s}s, inside the hook's 15 s: exit 0, the card, the budget's line as a note" \
  || bad "compact-resume on a slow link -- rc=$sf_rc ${sf_s}s $(tail -2 "$SFW/s1.txt")"
sf_s=$(date +%s); sf_m=$(sf_mark); sf next > "$SFW/s2.txt"; sf_rc=$?; sf_s=$(( $(date +%s) - sf_s )); sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_s" -gt 10 ] && [ "$sf_r" = ok ] && sf_no_tb "$SFW/s2.txt" \
  && ok "a slow but moving pull finishes: a 624 KB file at 48,000 B/s takes ${sf_s}s, over 10 s, and lands whole (exit 0, base, hi2vi and the disk agree)" \
  || bad "a slow but moving pull was refused -- rc=$sf_rc ${sf_s}s $sf_r / $(grep -m1 'hi2vi' "$SFW/s2.txt")"
sf_big "$SF/.sikstack/works/phases/active/P1/topics/slow-push.md" pushed
sf_s=$(date +%s); sf_m=$(sf_mark); sf next > "$SFW/s3.txt"; sf_rc=$?; sf_s=$(( $(date +%s) - sf_s )); sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_s" -gt 10 ] && [ "$sf_r" = ok ] && sf_no_tb "$SFW/s3.txt" \
  && ok "a slow but moving push finishes: a 624 KB change at 48,000 B/s takes ${sf_s}s, over 10 s, and lands once" \
  || bad "a slow but moving push was refused -- rc=$sf_rc ${sf_s}s $sf_r / $(tail -1 "$SFW/s3.txt")"
sf_ctl '{"rate": 0, "commit": "drop-before"}'; sf_big "$SF/.sikstack/works/phases/active/P1/topics/slow-resend.md" resent
sf_v=$(sf_revs revisions); sf_m=$(sf_mark); sf next > "$SFW/s4.txt"; sf_rc=$?; sf_r=$(sf_check "$sf_m" unsent "$sf_v")
sf_bid=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["batches"][0])' "$SF/.sikstack/.hi2vi/journal.json" 2>/dev/null)
sf_ctl '{"rate": 48000}'
sf_s=$(date +%s); sf_m=$(sf_mark); sf next > "$SFW/s5.txt"; sf_rc2=$?; sf_s=$(( $(date +%s) - sf_s )); sf_r2=$(sf_check "$sf_m" resent "$sf_bid" "$sf_v" first)
sf_ctl '{"rate": 0}'
[ "$sf_rc" = 1 ] && [ "$sf_r" = ok ] && [ "$sf_rc2" = 0 ] && [ "$sf_s" -gt 10 ] && [ "$sf_r2" = ok ] \
  && ok "a pushing batch resent at the begin step over a slow link (${sf_s}s, over 10 s) lands once" \
  || bad "a slow resend of a pushing batch -- rc=$sf_rc/$sf_rc2 ${sf_s}s $sf_r / $sf_r2 / $(tail -1 "$SFW/s5.txt")"
# A stalled server and a dripping one still end an ordinary command in one line, in bounded time: no byte for 10 s, or
# fewer than 1024 bytes in a 10 s window (a byte a second).
sf_bad=""
for sf_sw in "slow:12:no byte moved for 10 s" "drip:1:fewer than 1024 bytes moved in 10 s"; do
  sf_k=${sf_sw%%:*}; sf_n=${sf_sw#*:}; sf_why=${sf_n#*:}; sf_n=${sf_n%%:*}
  sf_ctl "{\"$sf_k\": $sf_n}"
  sf_t1=$(sf_tree); sf_s=$(date +%s); sf next > "$SFW/s6.txt"; sf_rc=$?; sf_s=$(( $(date +%s) - sf_s )); sf_t2=$(sf_tree)
  sf_ctl "{\"$sf_k\": 0}"
  { [ "$sf_rc" = 1 ] && [ "$sf_s" -le 22 ] && [ "$sf_t1" = "$sf_t2" ] && [ "$(grep -c '' "$SFW/s6.txt")" = 1 ] \
    && grep -qF "hi2vi is not reachable at $SFS ($sf_why): in cloud mode nothing runs offline, and nothing was changed." "$SFW/s6.txt"; } \
    || sf_bad="$sf_bad [$sf_k: rc=$sf_rc ${sf_s}s $(head -1 "$SFW/s6.txt")]"
done
[ -z "$sf_bad" ] && ok "a server that stalls (no byte for 10 s) or drips (a byte a second) ends an ordinary command in one line within 22 s, the tree unchanged" \
  || bad "a stalled or dripping server --$sf_bad"
sleep 2
# A 409 whose body stalls is no answer: it never reads as a batch with no conflicts. The journal keeps the batch; the
# next command resends it and meets hi2vi's whole 409 (1 conflict), then the mismatch waits for sync.
sf_p=works/phases/active/P1/topics/slow-pull.md; printf 'changed here\n' >> "$SF/.sikstack/$sf_p"
sf_ctl "{\"race\": {\"path\": \"$sf_p\", \"content\": \"changed in hi2vi by another checkout\\n\"}, \"break\": {\"route\": \"commit\", \"how\": \"hold\"}}"
sf next > "$SFW/s7.txt"; sf_rc=$?; sf_ctl '{"break": null}'
sf_j=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("state"))' "$SF/.sikstack/.hi2vi/journal.json" 2>/dev/null)
sf next > "$SFW/s8.txt"; sf_rc2=$?
[ "$sf_rc" = 1 ] && [ "$(tail -1 "$SFW/s7.txt")" = "this change is on disk but not in hi2vi (hi2vi unreachable: no byte moved for 10 s): run sync" ] \
  && [ "$sf_j" = pushing ] && [ "$sf_rc2" = 1 ] && grep -qF "(1 conflict(s)): run sync" "$SFW/s8.txt" && sf_no_tb "$SFW/s8.txt" \
  && ok "a 409 whose body stalls is one line and keeps the batch (never 0 conflicts); the resend meets hi2vi's whole 409 with its conflict" \
  || bad "a 409 with a stalled body -- rc=$sf_rc/$sf_rc2 journal=$sf_j $(tail -1 "$SFW/s7.txt") / $(tail -1 "$SFW/s8.txt")"
sf_put "$sf_p" "$SF/.sikstack/$sf_p"
sf_m=$(sf_mark); sf next >/dev/null; sf_rc=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_r" = ok ] || bad "the checkout did not settle after the stalled 409 -- rc=$sf_rc $sf_r"
# No timer can turn a whole answer into an unreachable one: with the limit at 1 s and 1.5 s spent after the answer is
# read (where a wall-clock alarm would land), the request still returns hi2vi's answer.
sf_late=$( cd "$SF" && XDG_CONFIG_HOME="$SFX" python3 - <<'PY' 2>&1
import importlib.util, sys, time
spec = importlib.util.spec_from_file_location("workflow_engine", __import__("os").environ["ENG"])
mod = importlib.util.module_from_spec(spec)
sys.modules["workflow_engine"] = mod
spec.loader.exec_module(mod)
cloud = sys.modules["wf_cloud"]  # the cloud part the engine imported
cloud.CLOUD_TIMEOUT = 1
real = cloud.CloudLink._exchange
def late(self, *a, **k):
    answer = real(self, *a, **k)
    time.sleep(1.5)
    return answer
cloud.CloudLink._exchange = late
try:
    status, payload = cloud.CloudLink().call("GET", "head")
    print(f"answer {status} {isinstance(payload.get('head'), int)}")
except Exception as exc:
    print(f"{exc.__class__.__name__}: {exc}")
PY
)
[ "$sf_late" = "answer 200 True" ] && ok "an answer already read is never turned into unreachable by a late timer" || bad "a late timer turned a whole answer into a failure -- $sf_late"
# The connection's set-up is judged too. Behind an HTTPS proxy that answers its CONNECT 6 s late and then forwards
# nothing, or drips its CONNECT answer a byte every 2 s, the session hook still ends inside its 9 s with the note and an
# ordinary command in one line in about 10 s (the connect is one wait the idle limit bounds; then the floor judges each
# step of the tunnel and the TLS handshake, its window counted from the request's start and only the peer's bytes counted
# in it). The checkout points at an
# https hi2vi only the proxy could reach (never resolved here: urllib hands the name to the proxy); each command is
# cut at 40 s by pid, so a hang fails the row, not the suite.
cat > "$SFW/proxy.py" <<'PY'
import os, socket, sys, threading, time
port_file, mode = sys.argv[1], sys.argv[2]
def serve(c):
    try:
        c.recv(4096)
        if mode == "late":
            time.sleep(6)
            c.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
            while c.recv(4096):
                pass
        else:
            c.sendall(b"HTTP/1.1 200 Connection established\r\n")
            while True:
                for b in b"X-Wait: y\r\n":
                    c.sendall(bytes([b]))
                    time.sleep(2)
    except OSError:
        pass
    finally:
        c.close()
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 0))
s.listen(8)
with open(port_file + ".tmp", "w") as f:
    f.write(str(s.getsockname()[1]))
os.replace(port_file + ".tmp", port_file)
threading.Timer(300, lambda: os._exit(0)).start()
while True:
    c, _ = s.accept()
    threading.Thread(target=serve, args=(c,), daemon=True).start()
PY
# sf_capped <out> <proxy> <args>: one engine command behind HTTPS_PROXY, cut at 40 s; prints "<rc|killed> <seconds>".
sf_capped() { _out=$1; _px=$2; shift 2; ( cd "$SF" && XDG_CONFIG_HOME="$SFX" python3 - "$_out" "$_px" "$@" <<'PY'
import os, subprocess, sys, time
out, proxy, args = sys.argv[1], sys.argv[2], sys.argv[3:]
env = dict(os.environ, HTTPS_PROXY=proxy, https_proxy=proxy)
for k in ("NO_PROXY", "no_proxy", "ALL_PROXY", "all_proxy"):
    env.pop(k, None)
t = time.monotonic()
entry = __import__("os").environ["ADP"] if args[:1] == ["compact-resume"] else __import__("os").environ["ENG"]
p = subprocess.Popen([sys.executable, entry] + args, env=env, stdin=subprocess.PIPE,
                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
try:
    data, _ = p.communicate(b"{}" if args[:1] == ["compact-resume"] else b"", timeout=40)
    rc = p.returncode
except subprocess.TimeoutExpired:
    p.kill()
    data, _ = p.communicate()
    rc = "killed"
open(out, "wb").write(data)
print(f"{rc} {time.monotonic() - t:.0f}")
PY
); }
sf_px_pids=()
for sf_k in late drip; do
  python3 "$SFW/proxy.py" "$SFW/px-$sf_k" "$sf_k" > /dev/null 2>&1 & sf_px_pids+=($!)
done
for _ in $(seq 1 50); do [ -s "$SFW/px-late" ] && [ -s "$SFW/px-drip" ] && break; sleep 0.1; done
cp "$SF/.sikstack/config.toml" "$SFW/link.bak"; cp "$SFX/sikstack/workspace-keys.json" "$SFW/keys2.bak"
set_link "$SF/.sikstack" "https://hi2vi.invalid"
python3 - "$SFX/sikstack/workspace-keys.json" "$SFS" <<'PY'
import json, sys
keys, old = sys.argv[1:]
k = json.load(open(keys)); k["https://hi2vi.invalid"] = k[old]; json.dump(k, open(keys, "w"))
PY
sf_bad=""
for sf_k in late drip; do
  sf_px="http://127.0.0.1:$(cat "$SFW/px-$sf_k")"
  read -r sf_rc sf_s < <(sf_capped "$SFW/p-$sf_k-hook.txt" "$sf_px" compact-resume)
  { [ "$sf_rc" = 0 ] && [ "$sf_s" -le 11 ] && grep -q '^compaction=done' "$SFW/p-$sf_k-hook.txt" \
    && grep -qF "note: hi2vi is not reachable at https://hi2vi.invalid (the session hook's 9 s for hi2vi ran out)" "$SFW/p-$sf_k-hook.txt"; } \
    || sf_bad="$sf_bad [$sf_k hook: rc=$sf_rc ${sf_s}s $(tail -1 "$SFW/p-$sf_k-hook.txt")]"
  sf_t1=$(sf_tree); read -r sf_rc sf_s < <(sf_capped "$SFW/p-$sf_k-next.txt" "$sf_px" next); sf_t2=$(sf_tree)
  { [ "$sf_rc" = 1 ] && [ "$sf_s" -le 12 ] && [ "$sf_t1" = "$sf_t2" ] && [ "$(grep -c '' "$SFW/p-$sf_k-next.txt")" = 1 ] \
    && grep -qF "hi2vi is not reachable at https://hi2vi.invalid (fewer than 1024 bytes moved in 10 s): in cloud mode nothing runs offline, and nothing was changed." "$SFW/p-$sf_k-next.txt"; } \
    || sf_bad="$sf_bad [$sf_k next: rc=$sf_rc ${sf_s}s $(head -1 "$SFW/p-$sf_k-next.txt")]"
done
kill "${sf_px_pids[@]}" 2>/dev/null; wait "${sf_px_pids[@]}" 2>/dev/null
cp "$SFW/link.bak" "$SF/.sikstack/config.toml"; cp "$SFW/keys2.bak" "$SFX/sikstack/workspace-keys.json"; chmod 600 "$SFX/sikstack/workspace-keys.json"
# The set-up floor counts only the peer's bytes, whatever this machine's TLS library sends (a ClientHello is about
# 200 B on LibreSSL, over 1,500 B on OpenSSL 3.5). In-process, the limit at 2 s: a peer answers 39 B at 1.2 s and then
# swallows a 2,000 B ClientHello; the floor ends the set-up at 2 s (counting our own bytes, the idle limit at 3.2 s).
sf_own=$( cd "$SF" && python3 - <<'PY' 2>&1
import importlib.util, socket, sys, threading, time
spec = importlib.util.spec_from_file_location("workflow_engine", __import__("os").environ["ENG"])
mod = importlib.util.module_from_spec(spec); sys.modules["workflow_engine"] = mod; spec.loader.exec_module(mod)
mod = sys.modules["wf_cloud"]  # the cloud part the engine imported: its names, and the limit it reads
mod.CLOUD_TIMEOUT = 2
a, b = socket.socketpair()
def peer():
    time.sleep(1.2); b.sendall(b"HTTP/1.1 200 Connection established\r\n"[:37] + b"\r\n")
    while b.recv(65536): pass
threading.Thread(target=peer, daemon=True).start()
s, t = mod._CloudSocket(a, mod._CloudWire()), time.monotonic()
try:
    s.recv_into(bytearray(64)); s.sendall(b"x" * 2000); s.recv_into(bytearray(64)); print("no stall")
except mod._CloudStall as exc:
    print(f"{exc} {'early' if time.monotonic() - t < 2.8 else 'late'}")
PY
)
[ "$sf_own" = "fewer than 1024 bytes moved in 2 s early" ] || sf_bad="$sf_bad [own set-up bytes: $sf_own]"
[ -z "$sf_bad" ] && ok "behind an HTTPS proxy that answers CONNECT 6 s late then forwards nothing, or drips it, compact-resume ends inside its 9 s with the note and next in one line within 12 s, the tree unchanged; the set-up's floor counts only the peer's bytes" \
  || bad "a late or dripping HTTPS proxy --$sf_bad"
# Over TLS a byte counts as it crosses the socket, never a whole record at a time; the handshake keeps the context's
# verification. In-process, with the idle limit scaled to 2 s: a local TLS server behind a 4,000 B/s link sends a
# 17,000-byte answer, its first record 16 KiB (4 s on that link); a quick answer verifies its certificate (made here
# by openssl) and hostname, and an untrusted one is refused.
if command -v openssl >/dev/null 2>&1 && openssl req -x509 -newkey rsa:2048 -nodes -keyout "$SFW/tls.key" -out "$SFW/tls.crt" -days 2 \
     -subj /CN=localhost -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" > "$SFW/openssl.txt" 2>&1; then
  sf_tls=$( cd "$SF" && XDG_CONFIG_HOME="$SFX" python3 - "$SFW/tls.crt" "$SFW/tls.key" <<'PY' 2>&1
import importlib.util, json, socket, ssl, sys, threading, time
spec = importlib.util.spec_from_file_location("workflow_engine", __import__("os").environ["ENG"])
mod = importlib.util.module_from_spec(spec)
sys.modules["workflow_engine"] = mod
spec.loader.exec_module(mod)
mod = sys.modules["wf_cloud"]  # the cloud part the engine imported: its names, and the limits it reads
mod.CLOUD_TIMEOUT, mod.CLOUD_FLOOR = 2, 1024
cert, key = sys.argv[1], sys.argv[2]
server_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
server_ctx.load_cert_chain(cert, key)
def listener():
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
    s.bind(("127.0.0.1", 0))
    s.listen(8)
    return s
def answer(c, body):
    c.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % len(body) + body)
def tls_origin(s):  # head: a quick answer; big: 17,000 bytes in one write (records of 16 KiB)
    while True:
        c, _ = s.accept()
        try:
            c = server_ctx.wrap_socket(c, server_side=True)
            line = c.recv(65536).split(b"\r\n")[0]
            answer(c, json.dumps({"x": "y" * 17000} if b"/big" in line else {"head": 1}).encode())
        except (OSError, ssl.SSLError):
            pass
        finally:
            c.close()
def link(up_port, rate):  # a slow link: each direction forwarded at <rate> bytes a second
    s = listener()
    def pump(a, b):
        try:
            while True:
                d = a.recv(max(1, rate // 20))
                if not d:
                    break
                b.sendall(d)
                time.sleep(len(d) / rate)
        except OSError:
            pass
        for x in (a, b):
            try:
                x.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
    def run():
        while True:
            c, _ = s.accept()
            u = socket.create_connection(("127.0.0.1", up_port))
            threading.Thread(target=pump, args=(c, u), daemon=True).start()
            threading.Thread(target=pump, args=(u, c), daemon=True).start()
    threading.Thread(target=run, daemon=True).start()
    return s.getsockname()[1]
def call(port, route):
    link_ = mod.CloudLink({"server": f"https://localhost:{port}", "project_id": "proj-1"}, "k-tls")
    t = time.monotonic()
    try:
        status, payload = link_.call("GET", route)
        return f"{status} {len(payload.get('x', ''))} {time.monotonic() - t:.1f}s"
    except Exception as exc:  # noqa: BLE001
        return f"{exc.__class__.__name__}: {str(exc)[:90]} {time.monotonic() - t:.1f}s"
origin = listener()
threading.Thread(target=tls_origin, args=(origin,), daemon=True).start()
slow = link(origin.getsockname()[1], 4000)
trusted = lambda: ssl.create_default_context(cafile=cert)
ssl._create_default_https_context = ssl.create_default_context
print("untrusted:", call(origin.getsockname()[1], "head"))
ssl._create_default_https_context = trusted
print("quick:", call(origin.getsockname()[1], "head"))
print("record:", call(slow, "big"))
PY
)
  printf '%s\n' "$sf_tls" | grep -q '^untrusted: CloudUnreachable: .*CERTIFICATE_VERIFY_FAILED' \
    && printf '%s\n' "$sf_tls" | grep -qE '^quick: 200 0 ' \
    && printf '%s\n' "$sf_tls" | grep -qE '^record: 200 17000 ([3-9]|1[0-9])\.[0-9]s$' \
    && ok "over TLS the handshake verifies its certificate (an untrusted one refused) and a 16 KiB record crossing a slow link counts byte by byte: 17,000 B at 4,000 B/s finish with the idle limit at 2 s ($(printf '%s' "$sf_tls" | tr '\n' ' '))" \
    || bad "TLS waits -- $(printf '%s' "$sf_tls" | tr '\n' ' ')"
else
  echo "note: no openssl to make a test certificate: the TLS row is skipped ($(tail -1 "$SFW/openssl.txt" 2>/dev/null))"
fi
# Any other failure inside the begin or the commit step (simulated: the step raises a RuntimeError) is one line too:
# before the command, it did not run (the hook prints its card and the note); after it, the change is on disk only, the
# journal stays running and names the failure, and the next command refuses naming sync.
sf_boom() { _s=$1; shift; ( cd "$SF" && XDG_CONFIG_HOME="$SFX" python3 - "$_s" "$@" <<'PY'
import importlib.util, sys
entry = __import__("os").environ["ADP"] if sys.argv[2:3] == ["compact-resume"] else __import__("os").environ["ENG"]
spec = importlib.util.spec_from_file_location("workflow_entry", entry)
mod = importlib.util.module_from_spec(spec)
sys.modules["workflow_entry"] = mod
spec.loader.exec_module(mod)
def boom(self, *a, **k):
    raise RuntimeError("a failure inside the step")
setattr(sys.modules["wf_cloud"].CloudSession, sys.argv[1], boom)
sys.exit(mod.main(sys.argv[2:]))
PY
) 2>&1 | tee -a "$SF_OUT"; return "${PIPESTATUS[0]}"; }
sf_t1=$(sf_tree); sf_boom begin next > "$SFW/j.txt"; sf_rc=$?; sf_t2=$(sf_tree)
echo '{}' | sf_boom begin compact-resume > "$SFW/j2.txt"; sf_rc2=$?
sf_boom commit defer-job --title boom --reason r --trigger t --source manual > "$SFW/j3.txt"; sf_rc3=$?
sf next > "$SFW/j4.txt"; sf_rc4=$?
[ "$sf_rc" = 1 ] && [ "$(cat "$SFW/j.txt")" = "the step before the command stopped (RuntimeError: a failure inside the step), so the command did not run: run sync to see this checkout against hi2vi" ] \
  && [ "$sf_t1" = "$sf_t2" ] && [ "$sf_rc2" = 0 ] && grep -q '^compaction=done' "$SFW/j2.txt" && grep -q '^note: the step before the command stopped (RuntimeError' "$SFW/j2.txt" \
  && [ "$sf_rc3" = 1 ] && sf_no_tb "$SFW/j3.txt" && [ "$(tail -1 "$SFW/j3.txt")" = "this change is on disk but not in hi2vi (RuntimeError: a failure inside the step): run sync" ] \
  && [ "$sf_rc4" = 1 ] && grep -qF 'stopped before it finished, RuntimeError: ' "$SFW/j4.txt" \
  && ok "any other failure of the begin or the commit step is one line: the command did not run (the hook's note), or its change is on disk only with the journal naming it to the next command" \
  || bad "a non-cloud failure inside the boundary -- rc=$sf_rc/$sf_rc2/$sf_rc3/$sf_rc4 $(head -1 "$SFW/j.txt") / $(tail -1 "$SFW/j2.txt") / $(tail -1 "$SFW/j3.txt") / $(head -1 "$SFW/j4.txt")"
rm -f "$SF/.sikstack/.hi2vi/journal.json"; sf_m=$(sf_mark); sf next >/dev/null; sf_rc=$?; sf_r=$(sf_check "$sf_m" synced)
[ "$sf_rc" = 0 ] && [ "$sf_r" = ok ] || bad "the checkout did not settle after the simulated failure -- rc=$sf_rc $sf_r"
# A key in the key file that holds a control character is refused, and never quoted in the line.
sf_kf="$SFX/sikstack/workspace-keys.json"; cp "$sf_kf" "$SFW/keys.bak"
python3 - "$sf_kf" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for projects in d.values():
    projects["proj-1"]["key"] += "\ntail"
json.dump(d, open(sys.argv[1], "w"))
PY
sf next > "$SFW/i9.txt"; sf_rc=$?; cp "$SFW/keys.bak" "$sf_kf"; chmod 600 "$sf_kf"
[ "$sf_rc" = 1 ] && [ "$(grep -c '' "$SFW/i9.txt")" = 1 ] && ! grep -qF "$SFK" "$SFW/i9.txt" && grep -q 'holds spaces or control characters' "$SFW/i9.txt" \
  && ok "a key file whose key holds a newline is refused with one line, and the key is not in it" \
  || bad "a key with a newline -- rc=$sf_rc $(head -2 "$SFW/i9.txt" | sed "s/$SFK/<key>/g")"
# (h) the key never reaches the tree (journal and outbox included), the output or the fake's request log.
if grep -rqF "$SFK" "$SF" "$SF_OUT" "$SFW/fake" 2>/dev/null; then bad "the workspace key leaked into the tree, the output or the request log"
else ok "the workspace key appears nowhere in the checkout (journal and outbox included), the output or the fake's request log"; fi
kill "$SF_PID" 2>/dev/null; wait "$SF_PID" 2>/dev/null
echo "cloud safety test runtime: $(( $(date +%s) - sf_t0 ))s"

# ---------------------------------------------------------------------------
echo "== Test 23: link, unlink and sync against the local fake hi2vi, with a scratch XDG_CONFIG_HOME -- init hides .hi2vi/ in the workflow repo; link refuses http:// to a non-local host, uncommitted changes, another worktree, a phase in flight on a stream, a key file open to group or others, a wrong key and an already-linked checkout, each with nothing written; link reads the key from stdin, keeps it 0600 in a 0700 folder and uploads the truth set in batches under 8,000,000 B; next prints store=cloud and head sends X-Hi2vi-Base; worktree start is refused in cloud mode with nothing written; a second checkout joins from an unused install (following fetch's rest) or an equal set, and a used one is refused with the list; a typed brief id is resolved after the pull (it names what another checkout made, on the first try, and a number shared once the pull lands is refused); sync pulls and pushes the clean changes, lists a stale write, shows its diff, refuses --keep with no path, on a folder and on a path on neither side, and resolves only on --keep local|cloud, lists an interrupted command's files and pushes none until --keep; unlink refuses on a mismatch, then leaves a local-mode tree that validates and opens no socket; unlink --from-disk runs offline; the key appears nowhere =="
lk_t0=$(date +%s)
newtmp LKW; LKX="$LKW/xdg"; LK_OUT="$LKW/out.txt"; : > "$LK_OUT"
LKA="$LKW/a"; LKB="$LKW/b"; LKC="$LKW/c"; LKR="$LKW/root"
# lk <host> <args>: one engine command in that host's nested workspace, with the scratch XDG; stdin passes through.
lk() { _h=$1; shift; ( cd "$_h" && XDG_CONFIG_HOME="$LKX" python3 "$(wf_entry "$1")" "$@" ) 2>&1 | tee -a "$LK_OUT"; return "${PIPESTATUS[0]}"; }
# lk_nosock <engine> <args>: the same under a socket guard (any connect or urlopen ends the process with 97).
lk_nosock() { _e=$1; shift; ( cd "$(dirname "$(dirname "$_e")")" && XDG_CONFIG_HOME="$LKX" python3 - "$ENG" "$@" <<'PY'
import os, runpy, socket, sys, urllib.request
def guard(*a, **k):
    sys.stderr.write("SOCKET-OPENED\n")
    os._exit(97)
socket.socket.connect = guard
socket.create_connection = guard
urllib.request.urlopen = guard
urllib.request.OpenerDirector.open = guard
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name="__main__")
PY
) 2>&1 | tee -a "$LK_OUT"; return "${PIPESTATUS[0]}"; }
lk_install() { { mkhost "$@" \
  && git -C "$1/.sikstack" config user.email smoke@example.invalid && git -C "$1/.sikstack" config user.name smoke \
  && git -C "$1/.sikstack" add -A && git -C "$1/.sikstack" commit -q --allow-empty -m install; } > "$1.setup.txt" 2>&1 || bad "link probe: the install of $1 failed -- $(tail -3 "$1.setup.txt")"; }
lk_commit() { git -C "$1/.sikstack" add -A && git -C "$1/.sikstack" commit -qm "$2" >/dev/null; }
# The whole workflow tree's sha list (.git aside) plus the XDG folder's, to prove a refusal wrote nothing.
lk_tree() { python3 - "$1" "$LKX" <<'PY'
import hashlib, os, sys
for root in sys.argv[1:]:
    for d, dirs, files in sorted(os.walk(root)):
        dirs[:] = sorted(x for x in dirs if not (d == root and x == ".git"))
        for f in sorted(files):
            p = os.path.join(d, f)
            print(os.path.relpath(p, root), oct(os.stat(p).st_mode), hashlib.sha256(open(p, "rb").read()).hexdigest())
PY
}
lk_install "$LKA"; lk_install "$LKB"; lk_install "$LKC"
LKK="link-smoke-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"; LKO="other-secret-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s\n' "$LKK" > "$LKW/key"; chmod 600 "$LKW/key"
python3 "$REPO_ROOT/tests/fake_hi2vi.py" --dir "$LKW/fake" --port-file "$LKW/port" --key-file "$LKW/key" \
  --project proj-1 --org org-1 --lifetime 900 > "$LKW/fake.txt" 2>&1 &
LK_PID=$!
for _ in $(seq 1 100); do [ -s "$LKW/port" ] && break; sleep 0.1; done
LKS="http://127.0.0.1:$(cat "$LKW/port" 2>/dev/null)"; LKU="$LKS/projects/proj-1"
lk_mark() { if [ -f "$LKW/fake/requests.jsonl" ]; then grep -c '' "$LKW/fake/requests.jsonl"; else echo 0; fi; }
lk_ctl() { python3 - "$LKS" "$1" <<'PY'
import http.client, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("POST", "/_fake/control", sys.argv[2], {"Content-Type": "application/json"})
assert conn.getresponse().status == 200
PY
}
lk_put() { python3 - "$LKS" "$1" "$2" <<'PY' || bad "link probe: the fake write failed"
import http.client, json, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("POST", "/_fake/write", json.dumps({"path": sys.argv[2], "content": sys.argv[3]}), {"Content-Type": "application/json"})
assert conn.getresponse().status == 200
PY
}
# lk_check <workflow dir> <mark> <check> [args]: one named assertion over the fake's requests since <mark>, its
# records, the checkout's base.json and journal, and its disk.
lk_check() { python3 - "$LKW/fake/requests.jsonl" "$LKS" "$@" <<'PY'
import base64, hashlib, http.client, json, sys
from pathlib import Path
from urllib.parse import urlparse, quote
log, server, root, mark, check, extra = sys.argv[1], sys.argv[2], Path(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6:]
R = [json.loads(l) for l in (Path(log).read_text().splitlines() if Path(log).exists() else [])[mark:]]
C = [r for r in R if r["path"].endswith("/commit")]
u = urlparse(server)
def get(path):
    conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
    conn.request("GET", path)
    resp = conn.getresponse()
    return resp.status, json.loads(resp.read())
S = get("/_fake/state")[1]
live = {p: f for p, f in S["files"].items() if not f["deleted"]}
hi = root / ".hi2vi"
base = json.loads((hi / "base.json").read_text()) if (hi / "base.json").exists() else {}
journal = json.loads((hi / "journal.json").read_text()) if (hi / "journal.json").exists() else None
def sha(p):
    return hashlib.sha256((root / p).read_bytes()).hexdigest()
def cloud(p):
    return base64.b64decode(get("/_fake/file?path=" + quote(p))[1]["content"]).decode()
def need(cond, why):
    if not cond:
        print(why)
        sys.exit(1)
def synced():
    need(journal is None, f"the journal is left: {journal}")
    need(base.get("head") == S["head"], f"base head {base.get('head')} != hi2vi head {S['head']}")
    need(set(base["files"]) == set(live), f"base and hi2vi hold different paths: {sorted(set(base['files']) ^ set(live))[:4]}")
    for p, f in live.items():
        need(base["files"][p]["rev"] == f["rev"] and (root / p).is_file() and sha(p) == f["sha256"], f"{p}: base, disk and hi2vi disagree")
if check == "nothing":  # a refusal: no request reached the fake
    need(not R, f"a refused link reached hi2vi: {[r['path'] for r in R]}")
elif check == "upload":
    need(len(C) >= 2 and all(c["status"] == 200 for c in C), f"several landed batches expected: {[(c['status'], c.get('bytes')) for c in C]}")
    need(all(0 < c["bytes"] < 8_000_000 for c in C), f"a batch over 8,000,000 B: {[c.get('bytes') for c in C]}")
    need(all(c["batch"]["command"].startswith("link ") for c in C), "the upload's batches do not name link")
    ops = [op for c in C for op in c["batch"]["ops"]]
    need(all(op["op"] in ("put", "append") and op.get("base_rev") is None for op in ops), "the first upload only adds")
    need(len([p for p in live if "/topics/big-" in p]) == 3 and "works/phases/active/P1/phase.json" in live, "a file is missing in hi2vi")
    import re as _re
    table = _re.search(r"(?ms)^\[cloud\]\n(.*?)(?=^\[|\Z)", (root / "config.toml").read_text())
    link = dict(_re.findall(r'(?m)^(\w+) = "?([^"\n]*)"?$', table.group(1))) if table else {}
    need(link.get("server") == server and link.get("org_id") == "org-1" and link.get("project_id") == "proj-1" and "key" not in link
         and not (hi / "link.json").exists(), f"config.toml's [cloud] link: {link}")
    synced()
elif check == "next":  # extra: the line next printed
    heads = [r for r in R if r["path"].endswith("/head")]
    need(heads and all(r.get("base") == str(base.get("head")) for r in heads), f"head did not send X-Hi2vi-Base {base.get('head')}: {[r.get('base') for r in heads]}")
    need(extra[0] == f"store=cloud server={server} project=proj-1", f"next's store line: {extra[0]!r}")
elif check == "join":  # extra: page (the fetch followed rest)
    fetches = [r for r in R if r["path"].endswith("/fetch")]
    need(not C or all(c["status"] == 200 for c in C), "a join's batch failed")
    need(len(fetches) >= 2 and any(r.get("rest") for r in fetches), f"the join did not follow rest: {[(len(r['paths']), r.get('rest')) for r in fetches]}")
    synced()
elif check == "synced":
    synced()
elif check == "stale":  # extra: path, the cloud's content, revisions before
    path, content = extra[0], extra[1]
    need(all(op.get("path") != path for c in C for op in c["batch"]["ops"]), "sync sent the stale path")
    need(cloud(path) == content, "hi2vi's copy changed")
    need("changed here" in (root / path).read_text(), "the disk lost this checkout's change")
elif check == "clean":  # extra: the pulled path, the pushed path
    need((root / extra[0]).is_file() and extra[0] in live and sha(extra[0]) == live[extra[0]]["sha256"], "the clean cloud change was not pulled")
    need(extra[1] in live and sha(extra[1]) == live[extra[1]]["sha256"], "the clean local change was not pushed")
elif check == "kept-local":  # extra: path
    need(len(C) == 1 and C[0]["status"] == 200 and C[0]["batch"]["command"] == f"sync --keep local {extra[0]}", f"one keep batch expected: {[(c['status'], c['batch'].get('command')) for c in C]}")
    need(cloud(extra[0]) == (root / extra[0]).read_text(), "hi2vi does not hold the disk's copy")
elif check == "kept-cloud":  # extra: path, content
    need(not C, "keep cloud sent a batch")
    need((root / extra[0]).read_text() == extra[1] == cloud(extra[0]), "the disk does not hold hi2vi's copy")
elif check == "interrupted":  # extra: revisions before
    need(not C and S["revisions"] == int(extra[0]), "sync pushed an interrupted command's changes")
    need(journal is not None and journal.get("state") == "running", f"the journal is not running: {journal}")
elif check == "kept-append":
    ops = [op for c in C for op in c["batch"]["ops"] if op.get("path") == "works/events.jsonl"]
    need(len(C) == 1 and C[0]["status"] == 200 and [op["op"] for op in ops] == ["append"], f"events.jsonl kept as {[op['op'] for op in ops]}")
elif check == "revs":  # extra: revisions before (unchanged)
    need(S["revisions"] == int(extra[0]) and not C, "a refused sync changed hi2vi")
elif check == "quiet":  # a refusal or a read after a pull: no batch sent, the pull recorded, no journal left
    need(not C, f"a batch was sent: {[c['batch'].get('command') for c in C]}")
    synced()
print("ok")
PY
}
lk_revs() { python3 - "$LKS" <<'PY'
import http.client, json, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("GET", "/_fake/state")
print(json.loads(conn.getresponse().read())["revisions"])
PY
}
# (h) sikstack init hides .hi2vi/ in the workflow repo's own info/exclude, fresh and on a second run (a repair).
lk_ex="$LKB/.sikstack/.git/info/exclude"; grep -qx '/.hi2vi/' "$LKA/.sikstack/.git/info/exclude"; lk_rc=$?
grep -vx '/.hi2vi/' "$lk_ex" > "$LKW/ex"; cat "$LKW/ex" > "$lk_ex"; grep -qx '/.hi2vi/' "$lk_ex"; lk_rc2=$?
( cd "$LKB" && python3 "$ENG" init ) > "$LKW/update.txt" 2>&1; lk_rc3=$?
[ "$lk_rc" = 0 ] && [ "$lk_rc2" = 1 ] && [ "$lk_rc3" = 0 ] && grep -qx '/.hi2vi/' "$lk_ex" \
  && ok "sikstack init hides .hi2vi/ in the workflow repo's own info/exclude, fresh and again on a second run" \
  || bad "the .hi2vi/ exclude is missing -- fresh=$lk_rc stripped=$lk_rc2 update=$lk_rc3 $(tail -2 "$LKW/update.txt")"
# A phase with three 3 MB topics in A (committed): the first upload must split.
( lk "$LKA" phase new --phase P1 --name One --objective toy >/dev/null ) && mkdir -p "$LKA/.sikstack/works/phases/active/P1/topics"
for i in 1 2 3; do python3 -c 'import sys; open(sys.argv[1], "w").write(("line of a big topic %s\n" % sys.argv[2]) * 140000)' \
  "$LKA/.sikstack/works/phases/active/P1/topics/big-$i.md" "$i"; done
lk_commit "$LKA" phase
# (a) the refusals, each one line with nothing written: no request, the tree and the XDG folder unchanged.
lk_ref() {  # lk_ref <label> <expected line ERE> <host> <engine> <args...>: run under the socket guard, key on stdin
  _l=$1; _x=$2; _h=$3; shift 3; _t1=$(lk_tree "$_h"); _m=$(lk_mark)
  printf '%s\n' "$LKK" | lk_nosock "$@" > "$LKW/ref.txt"; _rc=$?
  _t2=$(lk_tree "$_h"); _r=$(lk_check "$_h" "$_m" nothing)
  [ "$_rc" = 1 ] && [ "$(grep -v '^Paste a workspace key' "$LKW/ref.txt" | grep -c '')" = 1 ] && grep -qE "$_x" "$LKW/ref.txt" && [ "$_t1" = "$_t2" ] && [ "$_r" = ok ] \
    && [ ! -e "$_h/.hi2vi" ] && ! grep -qF "$LKK" "$LKW/ref.txt" \
    && ok "link refuses $_l with one line, opens no socket and writes nothing" \
    || bad "link did not refuse $_l cleanly -- rc=$_rc $_r $(head -2 "$LKW/ref.txt") $(diff <(echo "$_t1") <(echo "$_t2") | head -3)"
}
lk_ref "http:// to a non-local host" '^hi2vi server http://hi2vi\.example must be https://' "$LKA/.sikstack" "$LKA/.sikstack/scripts/workflow.py" link http://hi2vi.example/projects/proj-1
printf 'not committed\n' > "$LKA/.sikstack/works/phases/active/P1/topics/loose.md"
lk_ref "uncommitted changes in the workflow repo" '^link refuses a workflow repo with uncommitted changes \(1 path\(s\), first works/phases/active/P1/topics/loose\.md\)' "$LKA/.sikstack" "$LKA/.sikstack/scripts/workflow.py" link "$LKU"
rm -f "$LKA/.sikstack/works/phases/active/P1/topics/loose.md"
git -C "$LKA/.sikstack" worktree add -q "$LKW/wt" -b side >/dev/null 2>&1
lk_ref "while the workflow repo has another worktree" '^link refuses while the workflow repo has another worktree' "$LKA/.sikstack" "$LKA/.sikstack/scripts/workflow.py" link "$LKU"
git -C "$LKA/.sikstack" worktree remove "$LKW/wt" >/dev/null 2>&1; git -C "$LKA/.sikstack" branch -q -D side >/dev/null 2>&1
( lk "$LKC" phase new --phase P1 --name Other --objective toy >/dev/null ) && lk_commit "$LKC" phase
python3 - "$LKC/.sikstack/works/phases/active/P1/phase.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["execution"] = {"mode": "parallel", "branch": "phase/P1-other", "worktree": None}
open(sys.argv[1], "w").write(json.dumps(d, indent=2) + "\n")
PY
lk_commit "$LKC" stamp
lk_ref "while a phase is in flight on its own stream" '^link refuses while a phase is in flight on its own stream \(P1\)' "$LKC/.sikstack" "$LKC/.sikstack/scripts/workflow.py" link "$LKU"
git -C "$LKC/.sikstack" reset -q --hard HEAD~1
mkdir -p "$LKX/sikstack" && chmod 700 "$LKX/sikstack" && printf '{"https://elsewhere.example": {"p": {"key": "%s"}}}\n' "$LKO" > "$LKX/sikstack/workspace-keys.json" && chmod 644 "$LKX/sikstack/workspace-keys.json"
lk_ref "a key file open to group or others (with the chmod fix, never the key)" "workspace-keys\.json can be read by group or others \(mode 0644\), and it holds workspace keys: run chmod 600 .*workspace-keys\.json, then run this again" "$LKA/.sikstack" "$LKA/.sikstack/scripts/workflow.py" link "$LKU"
grep -qF "$LKO" "$LKW/ref.txt" && bad "the 0644 refusal printed a key"
chmod 600 "$LKX/sikstack/workspace-keys.json"
lk_t1=$(lk_tree "$LKA/.sikstack"); printf 'not-the-key\n' | lk "$LKA" link "$LKU" > "$LKW/a6.txt"; lk_rc=$?; lk_t2=$(lk_tree "$LKA/.sikstack")
[ "$lk_rc" = 1 ] && grep -qx "hi2vi refused this key (HTTP 401): make a workspace key under Keys on the project's page: nothing was written" "$LKW/a6.txt" && [ "$lk_t1" = "$lk_t2" ] && [ ! -e "$LKA/.sikstack/.hi2vi" ] \
  && ok "link refuses a key hi2vi does not take (401) with one line and writes nothing (no .hi2vi/, the key file unchanged)" \
  || bad "a wrong key was not refused cleanly -- rc=$lk_rc $(tail -2 "$LKW/a6.txt")"
# (b) the link: the key from stdin, kept owner-only beside the other server's; the truth set uploaded in batches.
lk_m=$(lk_mark); printf '%s\n' "$LKK" | lk "$LKA" link "$LKU" > "$LKW/b.txt"; lk_rc=$?; lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" upload)
lk_modes=$(python3 -c 'import os, stat, sys; print("%o %o" % (stat.S_IMODE(os.stat(sys.argv[1]).st_mode), stat.S_IMODE(os.stat(sys.argv[2]).st_mode)))' "$LKX/sikstack" "$LKX/sikstack/workspace-keys.json")
lk_keys=$(python3 -c 'import json, sys; d = json.load(open(sys.argv[1])); print(sorted(d), d[sys.argv[2]]["proj-1"]["key"] == sys.argv[3], d[sys.argv[2]]["proj-1"]["org_id"])' "$LKX/sikstack/workspace-keys.json" "$LKS" "$LKK")
[ "$lk_rc" = 0 ] && [ "$lk_r" = ok ] && [ "$lk_modes" = "700 600" ] && [ "$lk_keys" = "['$LKS', 'https://elsewhere.example'] True org-1" ] \
  && grep -qxE "store=cloud server=$LKS project=proj-1 head=r[0-9]+" "$LKW/b.txt" && [ -z "$(git -C "$LKA/.sikstack" status --porcelain)" ] \
  && ok "link reads the key from stdin, verifies it by head, keeps it in a 0700 folder's 0600 file beside the other server's key, writes the link as config.toml's [cloud] table without it (committed alone) and uploads the truth set as several batches under 8,000,000 B; the workflow repo stays clean (.hi2vi/ excluded)" \
  || bad "the link upload wrong -- rc=$lk_rc $lk_r modes=$lk_modes keys=$lk_keys $(tail -2 "$LKW/b.txt") $(git -C "$LKA/.sikstack" status --porcelain | head -3)"
lk_m=$(lk_mark); lk "$LKA" next > "$LKW/b2.txt"; lk_rc=$?; lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" next "$(grep '^store=' "$LKW/b2.txt")")
[ "$lk_rc" = 0 ] && [ "$lk_r" = ok ] && ok "next prints store=cloud server=<server> project=<id> in a linked checkout, and its head request sends X-Hi2vi-Base: <synced head>" \
  || bad "next's store line or X-Hi2vi-Base wrong -- rc=$lk_rc $lk_r"
lk_ref "an already-linked checkout" '^this checkout is already linked \(store=cloud server=' "$LKB/.sikstack" "$LKA/.sikstack/scripts/workflow.py" link "$LKU"
# (f) O7: in cloud mode a stream command is refused with one line, before any request, with nothing written.
lk_t1=$(lk_tree "$LKA/.sikstack"); lk_m=$(lk_mark); lk_nosock "$LKA/.sikstack/scripts/workflow.py" worktree start P1 --host-branch side > "$LKW/f.txt"; lk_rc=$?; lk_t2=$(lk_tree "$LKA/.sikstack")
[ "$lk_rc" = 1 ] && [ "$(grep -c '' "$LKW/f.txt")" = 1 ] && grep -q '^worktree start is refused in cloud mode: ' "$LKW/f.txt" && [ "$lk_t1" = "$lk_t2" ] && [ "$(lk_check "$LKA/.sikstack" "$lk_m" nothing)" = ok ] \
  && [ -z "$(git -C "$LKA/.sikstack" branch --list 'phase/*')" ] \
  && ok "worktree start in a linked checkout is refused with one line, no request, no branch and nothing written" \
  || bad "worktree start was not refused in cloud mode -- rc=$lk_rc $(head -2 "$LKW/f.txt")"
lk_bad=""; lk_t1=$(lk_tree "$LKA/.sikstack"); lk_m=$(lk_mark)
for c in "worktree gate P1" "worktree teardown P1" "worktree merge-finish" "phase reopen P1 --note x"; do
  # shellcheck disable=SC2086
  lk_nosock "$LKA/.sikstack/scripts/workflow.py" $c > "$LKW/f2.txt"; lk_rc=$?
  { [ "$lk_rc" = 1 ] && [ "$(grep -c '' "$LKW/f2.txt")" = 1 ] && grep -q "^${c%% P1*} is refused in cloud mode: " "$LKW/f2.txt"; } || lk_bad="$lk_bad [$c: rc=$lk_rc $(head -1 "$LKW/f2.txt")]"
done
lk_t2=$(lk_tree "$LKA/.sikstack")
[ -z "$lk_bad" ] && [ "$lk_t1" = "$lk_t2" ] && [ "$(lk_check "$LKA/.sikstack" "$lk_m" nothing)" = ok ] \
  && ok "the other stream commands (worktree gate, -teardown, -merge-finish, phase reopen) are refused in cloud mode with one line each, nothing written" \
  || bad "a stream command ran in cloud mode --$lk_bad"
# (c) a second checkout: an unused install joins (the fetch paged, following rest); a used one is refused with the list.
lk_ctl '{"fetch_page": 4000}'; lk_m=$(lk_mark); printf '%s\n' "$LKK" | lk "$LKB" link "$LKU" > "$LKW/c.txt"; lk_rc=$?; lk_r=$(lk_check "$LKB/.sikstack" "$lk_m" join)
lk_ctl '{"fetch_page": null}'
[ "$lk_rc" = 0 ] && [ "$lk_r" = ok ] && grep -q "^linked: joined hi2vi's workspace ([0-9]* file(s) taken from hi2vi, this unused install's seed files replaced)" "$LKW/c.txt" \
  && [ -f "$LKB/.sikstack/works/phases/active/P1/topics/big-2.md" ] && grep -qF 'One' "$LKB/.sikstack/backlog.md" \
  && ok "a second checkout joins from an unused install: its seed files give way, every file is taken from hi2vi (fetch pages followed through rest) and the generated files are rebuilt" \
  || bad "the unused install did not join -- rc=$lk_rc $lk_r $(tail -3 "$LKW/c.txt")"
lk_t1=$(lk_tree "$LKC/.sikstack"); lk_m=$(lk_mark); printf '%s\n' "$LKK" | lk "$LKC" link "$LKU" > "$LKW/c2.txt"; lk_rc=$?; lk_t2=$(lk_tree "$LKC/.sikstack")
[ "$lk_rc" = 1 ] && grep -q "^link refuses: hi2vi already holds this project's workspace (r[0-9]*), and [0-9]* path(s) here differ from it" "$LKW/c2.txt" \
  && grep -qx 'differs  works/phases/active/P1/phase.json' "$LKW/c2.txt" && [ "$lk_t1" = "$lk_t2" ] && [ ! -e "$LKC/.sikstack/.hi2vi" ] \
  && ok "a used checkout is refused at the join with the list of differing paths, and nothing is written" \
  || bad "a used checkout's join was not refused with the list -- rc=$lk_rc $(head -4 "$LKW/c2.txt")"
lk_nosock "$LKB/.sikstack/scripts/workflow.py" unlink --from-disk > "$LKW/c3.txt"; lk_rc=$?
[ "$lk_rc" = 0 ] && [ ! -e "$LKB/.sikstack/.hi2vi" ] && grep -q '^unlinked from the disk, offline: changes made in hi2vi after r[0-9]* are not on this disk' "$LKW/c3.txt" \
  && grep -qx 'local mode: the files on disk are the truth again; commit them (git -C .sikstack add -A && git -C .sikstack commit)' "$LKW/c3.txt" \
  && ok "unlink --from-disk runs offline (no socket), removes .hi2vi/ and says what the disk cannot hold" \
  || bad "unlink --from-disk wrong -- rc=$lk_rc $(head -3 "$LKW/c3.txt")"
lk_commit "$LKB" unlinked; lk_m=$(lk_mark); printf '%s\n' "$LKK" | lk "$LKB" link "$LKU" > "$LKW/c4.txt"; lk_rc=$?; lk_r=$(lk_check "$LKB/.sikstack" "$lk_m" synced)
[ "$lk_rc" = 0 ] && [ "$lk_r" = ok ] && grep -q "^linked: joined hi2vi's workspace (0 file(s) taken from hi2vi)" "$LKW/c4.txt" \
  && ok "a checkout whose files equal hi2vi's joins with nothing taken" || bad "an equal set did not join -- rc=$lk_rc $lk_r $(tail -2 "$LKW/c4.txt")"
# A typed id is resolved after the begin step's pull: a brief id names what another checkout made since this one
# last pulled, on the first try (A makes each record, then B's very next command names it by its brief form).
lk_bad=""
lk_brief() {  # lk_brief <A's command> <B's command> <B's expected line ERE>
  _a=$1; _b=$2; _x=$3
  # shellcheck disable=SC2086
  lk "$LKA" $_a > "$LKW/br-a.txt" || lk_bad="$lk_bad [A: $_a: $(tail -1 "$LKW/br-a.txt")]"
  # shellcheck disable=SC2086
  lk "$LKB" $_b > "$LKW/br-b.txt"; _rc=$?
  { [ "$_rc" = 0 ] && grep -qE "$_x" "$LKW/br-b.txt"; } || lk_bad="$lk_bad [B: $_b: rc=$_rc $(head -1 "$LKW/br-b.txt")]"
}
lk_brief "phase new --phase 7-ab --name Brief --objective toy" "section 7" '^ +[0-9]+  Objective$'
lk_brief "slice new --phase P7-ab --slice P7-ab.S1 --name s" "route 7.S1" '^slice=P7-ab\.S1$'
lk_brief "defer-job --id 7-cd --title brief --reason r --trigger t --source manual" "drop-deferred 7 --reason r" '^dropped D7-cd: '
lk_brief "agenda-add --id 7-ef --title brief" "agenda-solve 7 --outcome done" '^solved A7-ef'
[ -z "$lk_bad" ] \
  && ok "in a linked checkout a brief id names what another checkout made since the last pull, on the first try: a phase number (section 7), a slice's brief phase part (route 7.S1), a deferred job's number (drop-deferred 7) and an agenda item's (agenda-solve 7)" \
  || bad "a brief id was resolved against the stale disk, before the pull --$lk_bad"
# A number unique on B's stale disk but shared once the pull lands is refused with the list, one line; the
# refusal still runs the commit step (no journal left, the pull recorded, nothing sent), and the full id runs.
( lk "$LKA" phase new --phase 7-zz --name Twin --objective toy >/dev/null )
lk_m=$(lk_mark); lk "$LKB" section 7 > "$LKW/br-c.txt"; lk_rc=$?; lk_r=$(lk_check "$LKB/.sikstack" "$lk_m" quiet)
lk_m=$(lk_mark); lk "$LKB" section 7-zz > "$LKW/br-d.txt"; lk_rc2=$?; lk_r2=$(lk_check "$LKB/.sikstack" "$lk_m" quiet)
lk "$LKA" route 7-ab.S1 > "$LKW/br-e.txt"; lk_rc3=$?
[ "$lk_rc" = 1 ] && [ "$(grep -c '' "$LKW/br-c.txt")" = 1 ] && grep -qx "'7' names 2 phases numbered 7: P7-ab, P7-zz -- type the tail (e.g. P7-ab or 7-ab)" "$LKW/br-c.txt" \
  && [ "$lk_r" = ok ] && [ "$lk_rc2" = 0 ] && grep -qE '^ +[0-9]+  Objective$' "$LKW/br-d.txt" && [ "$lk_r2" = ok ] \
  && [ "$lk_rc3" = 0 ] && grep -qx 'slice=P7-ab.S1' "$LKW/br-e.txt" \
  && ok "a brief id unique on the stale disk but shared after the pull is refused with the list in one line, exit 1; the commit step still runs (no journal left, the pull recorded, nothing sent); the full id then runs, and a tailed brief id of a record on the disk still resolves" \
  || bad "a number shared after the pull was not refused cleanly -- rc=$lk_rc/$lk_rc2/$lk_rc3 $lk_r / $lk_r2 $(head -2 "$LKW/br-c.txt")"
# (d) sync in A: a stale write (409) beside a clean change on each side.
lk_p=works/phases/active/P1/intent.md; printf 'changed here\n' >> "$LKA/.sikstack/$lk_p"
lk_ctl "{\"race\": {\"path\": \"$lk_p\", \"content\": \"changed in hi2vi by another checkout\\n\"}}"
lk "$LKA" next > "$LKW/d0.txt"; lk_rc0=$?
lk_put works/phases/active/P1/topics/cloud.md 'written in hi2vi
'; printf 'written here\n' > "$LKA/.sikstack/works/phases/active/P1/topics/local.md"
lk_v=$(lk_revs); lk_m=$(lk_mark); lk "$LKA" sync > "$LKW/d.txt"; lk_rc=$?
lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" clean works/phases/active/P1/topics/cloud.md works/phases/active/P1/topics/local.md)
lk_r2=$(lk_check "$LKA/.sikstack" "$lk_m" stale "$lk_p" 'changed in hi2vi by another checkout
' "$lk_v")
[ "$lk_rc0" = 1 ] && [ "$lk_rc" = 1 ] && [ "$lk_r" = ok ] && [ "$lk_r2" = ok ] \
  && grep -qE "^differs  $lk_p  here: changed since r[0-9]+ \(.+\)  hi2vi: r[0-9]+$" "$LKW/d.txt" && [ "$(grep -cE '^(differs|here only|cloud only|deleted|interrupted)' "$LKW/d.txt")" = 1 ] \
  && ok "sync pulls the clean hi2vi change, pushes the clean local one, and lists the stale write (differs, both sides' facts), resolving nothing: exit 1" \
  || bad "sync's list wrong -- rc=$lk_rc0/$lk_rc $lk_r / $lk_r2 / $(head -4 "$LKW/d.txt")"
lk "$LKA" sync --diff "$lk_p" > "$LKW/d2.txt"; lk_rc=$?
[ "$lk_rc" = 0 ] && grep -qx -- '-changed in hi2vi by another checkout' "$LKW/d2.txt" && grep -qx -- '+changed here' "$LKW/d2.txt" && grep -q "^--- hi2vi/$lk_p (r[0-9]*)" "$LKW/d2.txt" \
  && ok "sync --diff shows hi2vi's copy against the disk as a unified diff" || bad "sync --diff wrong -- rc=$lk_rc $(head -5 "$LKW/d2.txt")"
lk_v=$(lk_revs); lk_m=$(lk_mark); lk "$LKA" sync --keep local > "$LKW/d3.txt"; lk_rc=$?; lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" revs "$lk_v")
lk "$LKA" next > "$LKW/d4.txt"; lk_rc2=$?
[ "$lk_rc" != 0 ] && [ "$(grep -c '' "$LKW/d3.txt")" = 1 ] && grep -q '^sync --keep needs at least one path' "$LKW/d3.txt" && [ "$lk_r" = ok ] \
  && [ "$lk_rc2" = 1 ] && grep -q '^1 files differ between this checkout and hi2vi: run sync' "$LKW/d4.txt" \
  && ok "sync --keep with no path is refused with one line and nothing sent; the stale write still stops the next command" \
  || bad "sync --keep without a path was not refused -- rc=$lk_rc/$lk_rc2 $lk_r $(head -2 "$LKW/d3.txt") / $(head -1 "$LKW/d4.txt")"
# --keep takes only a file on one side or the other: a folder, or a path on neither side, is refused with one line,
# nothing sent and nothing written (never "hi2vi holds it now", never a traceback); so is --diff on a folder.
lk_bad=""
for lk_args in "--keep local works/agenda" "--keep local works/no-such-file.md" "--keep cloud works/agenda" "--keep cloud works/no-such-file.md" "--diff works/agenda"; do
  lk_v=$(lk_revs); lk_m=$(lk_mark); lk_t1=$(lk_tree "$LKA/.sikstack")
  # shellcheck disable=SC2086
  lk "$LKA" sync $lk_args > "$LKW/d9.txt"; lk_rc=$?; lk_t2=$(lk_tree "$LKA/.sikstack"); lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" revs "$lk_v")
  case "$lk_args" in *agenda) lk_want='^works/agenda is a folder: sync takes file paths, one by one as sync lists them \(nothing was changed\)$' ;;
    *) lk_want='^sync --keep refused: works/no-such-file\.md names no file here or in hi2vi; it takes the file paths sync lists \(nothing was changed\)$' ;; esac
  { [ "$lk_rc" = 1 ] && [ "$(grep -c '' "$LKW/d9.txt")" = 1 ] && grep -qE "$lk_want" "$LKW/d9.txt" && [ "$lk_r" = ok ] && [ "$lk_t1" = "$lk_t2" ]; } \
    || lk_bad="$lk_bad [sync $lk_args: rc=$lk_rc $lk_r $(head -1 "$LKW/d9.txt")]"
done
lk "$LKA" next > "$LKW/d4.txt"; lk_rc2=$?
[ -z "$lk_bad" ] && [ "$lk_rc2" = 1 ] && grep -q '^1 files differ between this checkout and hi2vi: run sync' "$LKW/d4.txt" \
  && ok "sync --keep local|cloud on a folder or on a path on neither side, and sync --diff on a folder, are refused with one line each, nothing sent, the tree unchanged; the stale write still waits" \
  || bad "sync --keep on a folder or an unknown path was not refused --$lk_bad rc=$lk_rc2 $(head -1 "$LKW/d4.txt")"
lk_m=$(lk_mark); lk "$LKA" sync --keep local "$lk_p" > "$LKW/d5.txt"; lk_rc=$?; lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" kept-local "$lk_p")
lk_m=$(lk_mark); lk "$LKA" sync > "$LKW/d6.txt"; lk_rc2=$?; lk_r2=$(lk_check "$LKA/.sikstack" "$lk_m" synced)
lk "$LKA" sync --status > "$LKW/d7.txt"; lk_rc3=$?
[ "$lk_rc" = 0 ] && [ "$lk_r" = ok ] && [ "$lk_rc2" = 0 ] && [ "$lk_r2" = ok ] && grep -q '^in sync: ' "$LKW/d6.txt" && grep -qE '^in sync: head=r([0-9]+) base=r\1$' "$LKW/d5.txt" && [ "$lk_rc3" = 0 ] \
  && grep -qxE "store=cloud server=$LKS project=proj-1 head=r([0-9]+) base=r\1 here=0 differ=0 inbox=0" "$LKW/d7.txt" \
  && ok "sync --keep local <path> pushes the disk's copy over hi2vi's revision (recorded as that command); then sync is clean and sync --status reads head=base, here=0 differ=0" \
  || bad "sync --keep local wrong -- rc=$lk_rc/$lk_rc2/$lk_rc3 $lk_r / $lk_r2 / $(cat "$LKW/d7.txt")"
printf 'changed here again\n' >> "$LKA/.sikstack/$lk_p"
lk_ctl "{\"race\": {\"path\": \"$lk_p\", \"content\": \"hi2vi wins this one\\n\"}}"; lk "$LKA" next >/dev/null
lk_m=$(lk_mark); lk "$LKA" sync --keep cloud "$lk_p" > "$LKW/d8.txt"; lk_rc=$?; lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" kept-cloud "$lk_p" 'hi2vi wins this one
')
lk_m=$(lk_mark); lk "$LKA" next >/dev/null; lk_rc2=$?; lk_r2=$(lk_check "$LKA/.sikstack" "$lk_m" synced)
[ "$lk_rc" = 0 ] && [ "$lk_r" = ok ] && [ "$lk_rc2" = 0 ] && [ "$lk_r2" = ok ] \
  && ok "sync --keep cloud <path> writes hi2vi's copy over the disk, and the next command runs synced" \
  || bad "sync --keep cloud wrong -- rc=$lk_rc/$lk_rc2 $lk_r / $lk_r2 $(tail -2 "$LKW/d8.txt")"
# An interrupted command: sync lists its files as interrupted and pushes none of them until --keep.
( cd "$LKA" && XDG_CONFIG_HOME="$LKX" python3 - defer-job --title killed --reason r --trigger t --source manual <<'PY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("workflow_engine", __import__("os").environ["ENG"])
mod = importlib.util.module_from_spec(spec)
sys.modules["workflow_engine"] = mod
spec.loader.exec_module(mod)
agenda = sys.modules["wf_agenda"]  # the agenda part the engine imported
real = agenda.defer_job
def crash(args):
    real(args)
    os._exit(9)
agenda.defer_job = crash
sys.exit(mod.main(sys.argv[1:]))
PY
) >> "$LK_OUT" 2>&1
lk_v=$(lk_revs); lk_m=$(lk_mark); lk "$LKA" sync > "$LKW/e.txt"; lk_rc=$?; lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" interrupted "$lk_v")
lk_ip=$(grep '^interrupted  ' "$LKW/e.txt" | awk '{print $2}' | tr '\n' ' ')
[ "$lk_rc" = 1 ] && [ "$lk_r" = ok ] && echo "$lk_ip" | grep -q 'works/deferred/open/.*/deferred.json' \
  && ok "after a command killed midway, sync lists its files as interrupted and pushes none of them (the journal stays running)" \
  || bad "sync did not hold the interrupted files -- rc=$lk_rc $lk_r $(head -3 "$LKW/e.txt")"
# shellcheck disable=SC2086
lk_m=$(lk_mark); lk "$LKA" sync --keep local $lk_ip > "$LKW/e2.txt"; lk_rc=$?; lk_r0=$(lk_check "$LKA/.sikstack" "$lk_m" kept-append)
lk_m=$(lk_mark); lk "$LKA" next >/dev/null; lk_rc2=$?; lk_r=$(lk_check "$LKA/.sikstack" "$lk_m" synced)
[ "$lk_rc" = 0 ] && [ "$lk_rc2" = 0 ] && [ "$lk_r0" = ok ] && [ "$lk_r" = ok ] && grep -q '^the interrupted command (defer-job --title killed' "$LKW/e2.txt" \
  && ok "sync --keep local on the interrupted files pushes them (works/events.jsonl as its new lines, never a put), clears the journal, and the next command runs synced" \
  || bad "resolving the interrupted state wrong -- rc=$lk_rc/$lk_rc2 $lk_r0 / $lk_r $(head -3 "$LKW/e2.txt")"
# (e) unlink: refused on a mismatch (still linked), then the way back to local mode.
printf 'one more\n' >> "$LKA/.sikstack/$lk_p"
lk_ctl "{\"race\": {\"path\": \"$lk_p\", \"content\": \"and another\\n\"}}"; lk "$LKA" next >/dev/null
lk "$LKA" unlink > "$LKW/g.txt"; lk_rc=$?
[ "$lk_rc" = 1 ] && grep -qx '\[cloud\]' "$LKA/.sikstack/config.toml" && grep -q '^unlink refused, the checkout is still linked: 1 files differ between this checkout and hi2vi' "$LKW/g.txt" \
  && ok "unlink refuses on a mismatch with one line, and the checkout stays linked" || bad "unlink did not refuse on a mismatch -- rc=$lk_rc $(head -2 "$LKW/g.txt")"
lk "$LKA" sync --keep local "$lk_p" >/dev/null
lk_m=$(lk_mark); lk "$LKA" unlink > "$LKW/g2.txt"; lk_rc=$?
lk "$LKA" check --no-rebuild > "$LKW/g3.txt"; lk_rc2=$?
lk_in=""; for c in "next" "phase new --phase P2 --name Two --objective toy" "defer-job --title local --reason r --trigger t --source manual" "check"; do
  # shellcheck disable=SC2086
  lk_nosock "$LKA/.sikstack/scripts/workflow.py" $c > "$LKW/g4.txt"; [ "$?" = 97 ] && lk_in="$lk_in [$c]"
done
[ "$lk_rc" = 0 ] && [ ! -e "$LKA/.sikstack/.hi2vi" ] && ! grep -qx '\[cloud\]' "$LKA/.sikstack/config.toml" && grep -qx 'local mode: the files on disk are the truth again; commit them (git -C .sikstack add -A && git -C .sikstack commit)' "$LKW/g2.txt" \
  && [ "$lk_rc2" = 0 ] && [ -z "$lk_in" ] && [ -d "$LKA/.sikstack/works/phases/active/P2" ] && grep -qF "$LKS" "$LKX/sikstack/workspace-keys.json" \
  && ok "unlink pulls and pushes, removes .hi2vi/ and the [cloud] table and prints the one-commit line; the tree validates, local commands open no socket, and the key stays in user config" \
  || bad "unlink wrong -- rc=$lk_rc/$lk_rc2 nosock:$lk_in $(head -3 "$LKW/g2.txt") / $(tail -2 "$LKW/g3.txt")"
# The key file's mode is checked at every linked command too (B is linked): 0644 refuses before any request.
chmod 644 "$LKX/sikstack/workspace-keys.json"; lk_m=$(lk_mark); lk "$LKB" next > "$LKW/k.txt"; lk_rc=$?; chmod 600 "$LKX/sikstack/workspace-keys.json"
[ "$lk_rc" = 1 ] && grep -q 'workspace-keys.json can be read by group or others (mode 0644)' "$LKW/k.txt" && [ "$(lk_check "$LKB/.sikstack" "$lk_m" nothing)" = ok ] \
  && ok "a linked command with the key file at 0644 is refused with the chmod fix, before any request" \
  || bad "a 0644 key file was used by a linked command -- rc=$lk_rc $(head -2 "$LKW/k.txt")"
# (g) the key never reaches a tree (.hi2vi/ included), the output, the events or the fake's request log.
if grep -rqF "$LKK" "$LKA" "$LKB" "$LKC" "$LKR" "$LK_OUT" "$LKW/fake" "$LKW"/*.txt 2>/dev/null; then bad "the workspace key leaked into a tree, the output or the request log"
else ok "the workspace key appears nowhere in the checkouts (.hi2vi/ and events included), the commands' output or the fake's request log"; fi
kill "$LK_PID" 2>/dev/null; wait "$LK_PID" 2>/dev/null
echo "link test runtime: $(( $(date +%s) - lk_t0 ))s"

# ---------------------------------------------------------------------------
echo "== Test 24: the web's agenda inbox, applied by a linked engine against the local fake hi2vi -- at next and sync, entries oldest first, each run in-process as its agenda command: exit 0 applied, each in a batch of its own with exactly the files its command wrote; a refusal's one line sent verbatim with exit 1, a usage error's with exit 2; a brief id refused unrun with nothing written; an entry another checkout applied first is a 409, its change dropped here and hi2vi's copy pulled, never applied twice; a crash inside a command leaves the entry pending and the tree as it was; a delete clears its links in the same batch; the applier never deadlocks on .hi2vi/lock =="
ib_t0=$(date +%s)
newtmp IBW; IBX="$IBW/xdg"; IBA="$IBW/a"; IBL="$IBW/local"
# ib <host> <args>: one engine command in that host's nested workspace, with the scratch XDG, killed after 60 s
# (a deadlock on .hi2vi/lock would wait the lock's 120 s): exit 124 then.
ib() { _h=$1; shift; ( cd "$_h" && XDG_CONFIG_HOME="$IBX" python3 - "$@" <<'PY'
import subprocess, sys
try:
    sys.exit(subprocess.run([sys.executable, __import__("os").environ["ENG"]] + sys.argv[1:], timeout=60).returncode)
except subprocess.TimeoutExpired:
    print("TIMEOUT after 60 s")
    sys.exit(124)
PY
) 2>&1; }
ib_install() { { mkhost "$1" \
  && git -C "$1/.sikstack" config user.email smoke@example.invalid && git -C "$1/.sikstack" config user.name smoke \
  && git -C "$1/.sikstack" add -A && git -C "$1/.sikstack" commit -q --allow-empty -m install; } > "$1.setup.txt" 2>&1 || bad "inbox probe: the install of $1 failed -- $(tail -3 "$1.setup.txt")"; }
ib_install "$IBA"; ib_install "$IBL"
# A's workspace before the link: a phase and a deferred job, both linked to A1-k2; an Open A2-m3 and A4-n5.
{ ib "$IBA" phase new --phase P1 --name One --objective toy && ib "$IBA" agenda-add --id A1-k2 --title one \
  && ib "$IBA" agenda-add --id A2-m3 --title two && ib "$IBA" agenda-add --id A4-n5 --title four \
  && ib "$IBA" agenda-link A1-k2 --phase P1 && ib "$IBA" defer-job --title job --reason r --trigger t --source manual --agenda A1-k2 \
  && git -C "$IBA/.sikstack" add -A && git -C "$IBA/.sikstack" commit -qm seed; } > "$IBW/seed.txt" 2>&1 || bad "inbox probe: the seed failed -- $(tail -3 "$IBW/seed.txt")"
IBK="inbox-smoke-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s\n' "$IBK" > "$IBW/key"; chmod 600 "$IBW/key"
python3 "$REPO_ROOT/tests/fake_hi2vi.py" --dir "$IBW/fake" --port-file "$IBW/port" --key-file "$IBW/key" \
  --project proj-1 --org org-1 --lifetime 900 > "$IBW/fake.txt" 2>&1 &
IB_PID=$!
for _ in $(seq 1 100); do [ -s "$IBW/port" ] && break; sleep 0.1; done
IBS="http://127.0.0.1:$(cat "$IBW/port" 2>/dev/null)"
printf '%s\n' "$IBK" | ( cd "$IBA" && XDG_CONFIG_HOME="$IBX" python3 "$ENG" link "$IBS/projects/proj-1" ) > "$IBW/link.txt" 2>&1 || bad "inbox probe: the link failed -- $(tail -2 "$IBW/link.txt")"
ib_mark() { if [ -f "$IBW/fake/requests.jsonl" ]; then grep -c '' "$IBW/fake/requests.jsonl"; else echo 0; fi; }
# ib_post <route> <json>: a test-only POST to the fake; prints the answer's id (an inbox entry's) when it has one.
ib_post() { python3 - "$IBS" "$1" "$2" <<'PY'
import http.client, json, sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("POST", sys.argv[2], sys.argv[3], {"Content-Type": "application/json"})
resp = conn.getresponse()
assert resp.status == 200, resp.status
print(json.loads(resp.read()).get("id") or "")
PY
}
ib_web() { ib_post /_fake/inbox "$1"; }
# The workflow tree's sha list (.git and .hi2vi aside): what a refusal or an undone crash must leave equal.
ib_tree() { python3 - "$1" <<'PY'
import hashlib, os, sys
root, rows = sys.argv[1], []
for d, dirs, files in os.walk(root):
    dirs[:] = [x for x in dirs if not (d == root and x in (".git", ".hi2vi"))]
    for f in files:
        p = os.path.join(d, f)
        rows.append(f"{os.path.relpath(p, root)} {hashlib.sha256(open(p, 'rb').read()).hexdigest()}")
print("\n".join(sorted(rows)))
PY
}
# ib_check <mark> <check> [args]: one named assertion over the fake's requests since <mark>, its records and
# inbox, and A's base, journal and disk.
ib_check() { python3 - "$IBW/fake/requests.jsonl" "$IBS" "$IBA/.sikstack" "$@" <<'PY'
import base64, hashlib, http.client, json, sys
from pathlib import Path
from urllib.parse import urlparse, quote
log, server, root, mark, check, extra = sys.argv[1], sys.argv[2], Path(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6:]
R = [json.loads(l) for l in Path(log).read_text().splitlines()[mark:]]
C = [r for r in R if r["path"].endswith("/commit")]
u = urlparse(server)
def get(path):
    conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
    conn.request("GET", path)
    resp = conn.getresponse()
    return resp.status, json.loads(resp.read())
S, I = get("/_fake/state")[1], {e["id"]: e for e in get("/_fake/inbox")[1]["entries"]}
live = {p: f for p, f in S["files"].items() if not f["deleted"]}
hi = root / ".hi2vi"
base = json.loads((hi / "base.json").read_text())
journal = json.loads((hi / "journal.json").read_text()) if (hi / "journal.json").exists() else None
def sha(p):
    return hashlib.sha256((root / p).read_bytes()).hexdigest()
def cloud(p):
    return base64.b64decode(get("/_fake/file?path=" + quote(p))[1]["content"]).decode()
def need(cond, why):
    if not cond:
        print(why)
        sys.exit(1)
def synced():
    need(journal is None, f"the journal is left: {journal}")
    need(base.get("head") == S["head"], f"base head {base.get('head')} != hi2vi head {S['head']}")
    need(set(base["files"]) == set(live), f"base and hi2vi hold different paths: {sorted(set(base['files']) ^ set(live))[:4]}")
    for p, f in live.items():
        need(base["files"][p]["rev"] == f["rev"] and (root / p).is_file() and sha(p) == f["sha256"], f"{p}: base, disk and hi2vi disagree")
def with_result(eid):
    return [c for c in C if any(r["id"] == eid for r in c["batch"]["inbox"])]
if check == "applied":  # extra: the entry ids, oldest first; each applied, alone in its own landed batch with its files
    ids = extra
    batches = [c for c in C if c["batch"]["inbox"]]
    need([c["batch"]["inbox"][0]["id"] for c in batches] == ids, f"batches in the wrong order or count: {[c['batch']['inbox'] for c in batches]}")
    for eid, c in zip(ids, batches):
        need(c["status"] == 200 and len(c["batch"]["inbox"]) == 1, f"{eid}: not alone in a landed batch: {c['status']} {c['batch']['inbox']}")
        need(c["batch"]["inbox"][0] == {"id": eid, "state": "applied", "exit": 0, "reason": None}, f"{eid}: result {c['batch']['inbox'][0]}")
        need(I[eid]["state"] == "applied" and I[eid]["batch_id"] == c["batch"]["batch_id"], f"{eid}: hi2vi holds {I[eid]['state']}")
        paths = sorted(op["path"] for op in c["batch"]["ops"])
        need(paths and all(p.startswith("works/agenda/") or p == "works/events.jsonl" for p in paths), f"{eid}: unrelated files ride its batch: {paths}")
        need(c["batch"]["command"].startswith("agenda-"), f"{eid}: the batch names {c['batch']['command']!r}")
    need(json.loads((root / "works/agenda/A3-x2/agenda.json").read_text())["title"] == "from the web", "A3-x2 is not on disk")
    need(json.loads((root / "works/agenda/A2-m3/agenda.json").read_text())["status"] == "deferred", "A2-m3 is not deferred")
    synced()
elif check == "refused":  # extra: <entry id> <exit> <reason>; the result alone in a batch with no file
    eid, code, reason = extra[0], int(extra[1]), extra[2]
    c = with_result(eid)
    need(len(c) == 1 and c[0]["status"] == 200 and not c[0]["batch"]["ops"], f"{eid}: batches {[(x['status'], x['batch']['ops']) for x in c]}")
    need(c[0]["batch"]["inbox"] == [{"id": eid, "state": "refused", "exit": code, "reason": reason}], f"{eid}: sent {c[0]['batch']['inbox']}")
    need(I[eid]["state"] == "refused" and I[eid]["reason"] == reason and I[eid]["exit"] == code, f"{eid}: hi2vi holds {I[eid]}")
    synced()
elif check == "taken":  # extra: <entry id> <path>: one 409 batch, the disk equal to hi2vi's copy, applied once (by the other)
    eid, path = extra
    c = with_result(eid)
    need(len(c) == 1 and c[0]["status"] == 409, f"{eid}: batches {[x['status'] for x in c]}")
    need(I[eid]["state"] == "applied" and I[eid]["by"] == "checkout other", f"{eid}: hi2vi holds {I[eid]}")
    need((root / path).read_text() == cloud(path), f"{path}: the disk is not hi2vi's copy")
    need("agenda_edited" not in (root / "works/events.jsonl").read_text(), "the dropped edit's event is still on disk")
    synced()
elif check == "pending":  # extra: <entry id>: no result was sent and the entry waits
    eid = extra[0]
    need(not with_result(eid) and I[eid]["state"] == "pending", f"{eid}: sent {len(with_result(eid))}, hi2vi holds {I[eid]['state']}")
    need(not any(c["batch"]["ops"] for c in C), f"a crashed entry's files were sent: {[c['batch']['ops'] for c in C]}")
    synced()
elif check == "delete":  # extra: <entry id>: one batch holds the delete, the cleared links and the result
    eid = extra[0]
    c = with_result(eid)
    need(len(c) == 1 and c[0]["status"] == 200, f"{eid}: batches {[x['status'] for x in c]}")
    ops = {(op["op"], op["path"]) for op in c[0]["batch"]["ops"]}
    jobs = [p for o, p in ops if p.startswith("works/deferred/open/") and p.endswith("/deferred.json")]
    need(("delete", "works/agenda/A1-k2/agenda.json") in ops and ("put", "works/phases/active/P1/phase.json") in ops
         and len(jobs) == 1, f"{eid}: the batch holds {sorted(ops)}")
    for p in ["works/phases/active/P1/phase.json"] + jobs:
        need("agenda" not in json.loads((root / p).read_text()) and "agenda" not in json.loads(cloud(p)), f"{p} keeps its link")
    need(not (root / "works/agenda/A1-k2").exists() and "works/agenda/A1-k2/agenda.json" not in live, "A1-k2 is still there")
    synced()
else:
    need(False, f"unknown check {check}")
print("ok")
PY
}
ib_lockfree() { python3 - "$IBA/.sikstack/.hi2vi/lock" <<'PY'
import fcntl, os, sys
fd = os.open(sys.argv[1], os.O_RDWR)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    print("free")
except OSError:
    print("held")
PY
}
# (a) next applies two web changes, oldest first, each alone in its batch, and still prints its pointer.
ib_e1=$(ib_web '{"kind": "add", "minted_id": "A3-x2", "items": ["A3-x2"], "fields": {"title": "from the web"}}')
ib_e2=$(ib_web '{"kind": "defer", "items": ["A2-m3"]}')
ib_m=$(ib_mark); ib "$IBA" next > "$IBW/a.txt"; ib_rc=$?; ib_r=$(ib_check "$ib_m" applied "$ib_e1" "$ib_e2")
[ "$ib_rc" = 0 ] && [ "$ib_r" = ok ] && grep -qx "inbox $ib_e1: applied (agenda-add A3-x2): added A3-x2: from the web" "$IBW/a.txt" \
  && grep -qx "inbox $ib_e2: applied (agenda-defer A2-m3): deferred A2-m3" "$IBW/a.txt" && grep -q '^store=cloud ' "$IBW/a.txt" \
  && [ "$(ib_lockfree)" = free ] \
  && ok "next applies the web's agenda changes oldest first, each alone in a landed batch with exactly its own files, then runs as always (no deadlock on .hi2vi/lock, the lock free after)" \
  || bad "next did not apply the inbox -- rc=$ib_rc $ib_r $(head -3 "$IBW/a.txt")"
# (b) a brief id is refused unrun: exit 2, its line verbatim, nothing written (A1-k2 stays Open).
ib_e3=$(ib_web '{"kind": "solve", "items": ["A1"]}')
ib_t1=$(ib_tree "$IBA/.sikstack"); ib_m=$(ib_mark); ib "$IBA" sync > "$IBW/b.txt"; ib_rc=$?; ib_t2=$(ib_tree "$IBA/.sikstack")
ib_line="sikstack agenda-solve: error: A1 is not a full agenda id (like A7-m3): the inbox applies full ids only, so nothing ran"
ib_r=$(ib_check "$ib_m" refused "$ib_e3" 2 "$ib_line")
[ "$ib_rc" = 0 ] && [ "$ib_r" = ok ] && [ "$ib_t1" = "$ib_t2" ] && grep -qxF "inbox $ib_e3: refused, exit 2 (agenda-solve A1): $ib_line" "$IBW/b.txt" \
  && ok "a brief id in an inbox entry is refused unrun (exit 2, one line, nothing written, the result alone in a batch)" \
  || bad "a brief id was not refused unrun -- rc=$ib_rc $ib_r $(head -3 "$IBW/b.txt") $(diff <(echo "$ib_t1") <(echo "$ib_t2") | head -3)"
# (c) a refusal (exit 1) and a usage error (exit 2) reach the entry verbatim: the same line the engine prints.
ib_e4=$(ib_web '{"kind": "reopen", "items": ["A4-n5"]}')
ib_e5=$(ib_web '{"kind": "defer", "items": []}')
ib_l5=$(cd "$IBL" && python3 "$ENG" agenda-defer 2>&1); ib_rc5=$?
ib_l4="A4-n5 is Open already"
ib_m=$(ib_mark); ib "$IBA" sync > "$IBW/c.txt"; ib_rc=$?
ib_r=$(ib_check "$ib_m" refused "$ib_e4" 1 "$ib_l4"); ib_r2=$(ib_check "$ib_m" refused "$ib_e5" 2 "$ib_l5")
[ "$ib_rc" = 0 ] && [ "$ib_rc5" = 2 ] && [ "$ib_r" = ok ] && [ "$ib_r2" = ok ] && grep -qxF "inbox $ib_e4: refused, exit 1 (agenda-reopen A4-n5): $ib_l4" "$IBW/c.txt" \
  && ok "a refused agenda command's one line reaches its entry verbatim with exit 1, and a usage error's (as the engine prints it) with exit 2" \
  || bad "a refusal's line did not reach its entry -- rc=$ib_rc/$ib_rc5 $ib_r / $ib_r2 $(head -3 "$IBW/c.txt")"
# (d) another checkout applies an entry first: A's batch is a 409, its change dropped, hi2vi's copy pulled, once.
ib_e6=$(ib_web '{"kind": "edit", "items": ["A3-x2"], "fields": {"title": "renamed"}}')
ib_other=$(python3 -c 'import json, sys; d = json.load(open(sys.argv[1])); d.update(title="renamed", changed_at="2026-11-18T10:00:00+00:00"); print(json.dumps(d, indent=2))' "$IBA/.sikstack/works/agenda/A3-x2/agenda.json")
ib_post /_fake/control "$(python3 -c 'import json, sys; print(json.dumps({"inbox_race": sys.argv[1], "race": {"path": "works/agenda/A3-x2/agenda.json", "content": sys.argv[2] + "\n"}}))' "$ib_e6" "$ib_other")" > /dev/null
ib_m=$(ib_mark); ib "$IBA" sync > "$IBW/d.txt"; ib_rc=$?; ib_r=$(ib_check "$ib_m" taken "$ib_e6" works/agenda/A3-x2/agenda.json)
ib "$IBA" sync > "$IBW/d2.txt"; ib_rc2=$?
[ "$ib_rc" = 0 ] && [ "$ib_r" = ok ] && grep -qxF "inbox $ib_e6: not applied here (agenda-edit A3-x2): hi2vi holds it applied already (another checkout); this checkout's change was dropped and hi2vi's copy pulled" "$IBW/d.txt" \
  && [ "$ib_rc2" = 0 ] && ! grep -q "^inbox " "$IBW/d2.txt" \
  && ok "an entry another checkout applied first is a 409: this checkout's change is dropped and hi2vi's copy pulled, never applied twice" \
  || bad "an entry taken elsewhere was mishandled -- rc=$ib_rc/$ib_rc2 $ib_r $(head -3 "$IBW/d.txt")"
# (e) a crash inside a command (A1-k2's folder cannot be removed) leaves the entry pending and the tree as it was.
ib_e7=$(ib_web '{"kind": "delete", "items": ["A1-k2"]}')
chmod 555 "$IBA/.sikstack/works/agenda/A1-k2"
ib_t1=$(ib_tree "$IBA/.sikstack"); ib_m=$(ib_mark); ib "$IBA" next > "$IBW/e.txt"; ib_rc=$?; ib_t2=$(ib_tree "$IBA/.sikstack")
chmod 755 "$IBA/.sikstack/works/agenda/A1-k2"; ib_r=$(ib_check "$ib_m" pending "$ib_e7")
[ "$ib_rc" = 0 ] && [ "$ib_r" = ok ] && [ "$ib_t1" = "$ib_t2" ] \
  && grep -qxF "inbox $ib_e7: left pending (agenda-delete A1-k2): PermissionError inside the command; its changes were undone" "$IBW/e.txt" \
  && ok "a crash inside an agenda command leaves its entry pending (no result sent) and the tree as it was before that entry" \
  || bad "a crashed entry was not undone -- rc=$ib_rc $ib_r $(head -3 "$IBW/e.txt") $(diff <(echo "$ib_t1") <(echo "$ib_t2") | head -4)"
# (f) at the next next the delete applies: its links cleared in the same batch as the item's removal and its result.
ib_m=$(ib_mark); ib "$IBA" next > "$IBW/f.txt"; ib_rc=$?; ib_r=$(ib_check "$ib_m" delete "$ib_e7")
[ "$ib_rc" = 0 ] && [ "$ib_r" = ok ] && grep -q "^inbox $ib_e7: applied (agenda-delete A1-k2): deleted A1-k2: 2 links cleared" "$IBW/f.txt" \
  && ok "next applies a web delete: the item's removal, its cleared links (a phase and a deferred job) and the result land in one batch" \
  || bad "a web delete did not clear its links in one batch -- rc=$ib_rc $ib_r $(head -3 "$IBW/f.txt")"
if grep -rqF "$IBK" "$IBA" "$IBW"/*.txt "$IBW/fake" 2>/dev/null; then bad "the workspace key leaked into the tree, the output or the request log"; fi
kill "$IB_PID" 2>/dev/null; wait "$IB_PID" 2>/dev/null
echo "inbox test runtime: $(( $(date +%s) - ib_t0 ))s"

# ---------------------------------------------------------------------------
echo "== Test 25: a linked checkout's waiting-commit record and update, against the local fake hi2vi -- next prints commits_waiting= (the done slices finished since the link with no committed_at, in finish order; none for one done before the link); mark-committed records it in slice.json (synced to hi2vi), refuses a slice not done and local mode with nothing written, and leaving done clears it; review records a passing REVIEW itself; local mode prints no line and writes no field; --update on a linked checkout leaves changed works/ files unchanged and uncommitted and prints the update's own paths to stage, never add -A; --to-multi-repo refuses a linked install =="
wc_t0=$(date +%s)
newtmp WCW; WCX="$WCW/xdg"; WCA="$WCW/a"; WCL="$WCW/local"
wc() { _h=$1; shift; ( cd "$_h" && XDG_CONFIG_HOME="$WCX" python3 "$ENG" "$@" ) 2>&1; }
wc_install() { { mkhost "$1" \
  && git -C "$1/.sikstack" config user.email smoke@example.invalid && git -C "$1/.sikstack" config user.name smoke \
  && git -C "$1/.sikstack" add -A && git -C "$1/.sikstack" commit -q --allow-empty -m install; } > "$1.setup.txt" 2>&1 || bad "commit-record probe: the install of $1 failed -- $(tail -3 "$1.setup.txt")"; }
# wc_seed <host>: P1 with its DECOMP done (and committed, as every pre-link slice is) and two declared slices open.
wc_seed() { { wc "$1" phase new --phase P1 --name One --objective toy && wc "$1" slice start P1.DECOMP \
  && wc "$1" slice new --phase P1 --slice P1.S1 --name one --depends-on none && wc "$1" slice new --phase P1 --slice P1.S2 --name two --depends-on none \
  && wc "$1" slice finish P1.DECOMP --outcome cut && git -C "$1/.sikstack" add -A && git -C "$1/.sikstack" commit -qm seed; } > "$1.seed.txt" 2>&1 \
  || bad "commit-record probe: the seed of $1 failed -- $(tail -3 "$1.seed.txt")"; }
wc_install "$WCA"; wc_install "$WCL"; wc_seed "$WCA"; wc_seed "$WCL"
WCK="record-smoke-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s\n' "$WCK" > "$WCW/key"; chmod 600 "$WCW/key"
python3 "$REPO_ROOT/tests/fake_hi2vi.py" --dir "$WCW/fake" --port-file "$WCW/port" --key-file "$WCW/key" \
  --project proj-1 --org org-1 --lifetime 900 > "$WCW/fake.txt" 2>&1 &
WC_PID=$!
for _ in $(seq 1 100); do [ -s "$WCW/port" ] && break; sleep 0.1; done
WCS="http://127.0.0.1:$(cat "$WCW/port" 2>/dev/null)"
sleep 1  # a second boundary: the link's stamp falls after the seed's finish
printf '%s\n' "$WCK" | ( cd "$WCA" && XDG_CONFIG_HOME="$WCX" python3 "$ENG" link "$WCS/projects/proj-1" ) > "$WCW/link.txt" 2>&1 || bad "commit-record probe: the link failed -- $(tail -2 "$WCW/link.txt")"
WCJ="$WCA/.sikstack/works/phases/active/P1/slices"
wc_has() { python3 -c 'import json, sys; print("yes" if "committed_at" in json.load(open(sys.argv[1])) else "no")' "$WCJ/$1/slice.json"; }
wc_cloud_has() { python3 - "$WCS" "$1" <<'PY'
import base64, http.client, json, sys
from urllib.parse import urlparse, quote
u = urlparse(sys.argv[1]); conn = http.client.HTTPConnection(u.hostname, u.port, timeout=10)
conn.request("GET", "/_fake/file?path=" + quote(sys.argv[2])); resp = conn.getresponse()
print("yes" if resp.status == 200 and "committed_at" in json.loads(base64.b64decode(json.loads(resp.read())["content"])) else "no")
PY
}
wc_tree() { ( cd "$1" && find . -path ./.git -prune -o -type f -print | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done ); }
# (a) the done-before-link DECOMP never waits; a slice finished since waits until mark-committed records it.
wc_n0=$(wc "$WCA" next | grep '^commits_waiting=')
wc "$WCA" slice start P1.S1 >/dev/null; wc "$WCA" slice finish P1.S1 --outcome one >/dev/null
wc_n1=$(wc "$WCA" next | grep '^commits_waiting='); wc_h1=$(wc_has P1.S1)
wc_t1=$(wc_tree "$WCA/.sikstack/works"); wc_o2=$(wc "$WCA" mark-committed P1.S1 P1.S2); wc_rc2=$?; wc_t2=$(wc_tree "$WCA/.sikstack/works")
wc_o3=$(wc "$WCA" mark-committed 1.S1); wc_rc3=$?
wc_n3=$(wc "$WCA" next | grep '^commits_waiting=')
[ "$wc_n0" = "commits_waiting=none" ] && [ "$wc_n1" = "commits_waiting=P1.S1" ] && [ "$wc_h1" = no ] \
  && [ "$wc_rc2" = 1 ] && printf '%s\n' "$wc_o2" | grep -q "P1.S2 is todo, not done" && [ "$wc_t1" = "$wc_t2" ] \
  && [ "$wc_rc3" = 0 ] && printf '%s\n' "$wc_o3" | grep -q "^P1.S1: committed_at=" && [ "$wc_n3" = "commits_waiting=none" ] \
  && [ "$(wc_has P1.S1)" = yes ] && [ "$(wc_cloud_has works/phases/active/P1/slices/P1.S1/slice.json)" = yes ] \
  && ok "a linked checkout's waiting commit: next lists a slice finished since the link (not the DECOMP done before it) in commits_waiting=, mark-committed refuses a slice not done with nothing written, then records committed_at (synced to hi2vi) and the line reads none" \
  || bad "the linked waiting-commit record is wrong -- [$wc_n0] [$wc_n1] has=$wc_h1 rc=$wc_rc2/$wc_rc3 [$wc_n3] $(printf '%s' "$wc_o2" | head -2)"
# (b) leaving done clears the record (it waits again once done); a second finish keeps it; review records a REVIEW.
wc "$WCA" slice status P1.S1 in_progress >/dev/null; wc_h4=$(wc_has P1.S1); wc "$WCA" slice finish P1.S1 --outcome again >/dev/null
wc_n4=$(wc "$WCA" next | grep '^commits_waiting='); wc "$WCA" mark-committed P1.S1 >/dev/null; wc "$WCA" slice finish P1.S1 --outcome third >/dev/null
wc_n5=$(wc "$WCA" next | grep '^commits_waiting=')
{ wc "$WCA" slice start P1.S2 && wc "$WCA" slice finish P1.S2 --outcome two && wc "$WCA" mark-committed P1.S2 && wc "$WCA" gate P1 waive --note toy \
  && wc "$WCA" slice start P1.REVIEW && wc "$WCA" review P1 --verdict pass; } > "$WCW/review.txt" 2>&1; wc_rc6=$?
wc_n6=$(wc "$WCA" next | grep '^commits_waiting=')
[ "$wc_h4" = no ] && [ "$wc_n4" = "commits_waiting=P1.S1" ] && [ "$wc_n5" = "commits_waiting=none" ] && [ "$wc_rc6" = 0 ] \
  && [ "$wc_n6" = "commits_waiting=none" ] && [ "$(wc_has P1.REVIEW)" = yes ] \
  && ok "leaving done clears committed_at and the slice waits again once done; a second slice finish keeps it; review --verdict pass records the REVIEW's commit itself" \
  || bad "the record's lifecycle is wrong -- has=$wc_h4 [$wc_n4] [$wc_n5] rc=$wc_rc6 [$wc_n6] $(tail -2 "$WCW/review.txt")"
# (c) local mode: no line, no field; mark-committed is refused with nothing written.
wc "$WCL" slice start P1.S1 >/dev/null; wc "$WCL" slice finish P1.S1 --outcome one >/dev/null
wc_ln=$(wc "$WCL" next)
wc_t7=$(wc_tree "$WCL/.sikstack"); wc_o7=$(wc "$WCL" mark-committed P1.S1); wc_rc7=$?; wc_t8=$(wc_tree "$WCL/.sikstack")
! printf '%s\n' "$wc_ln" | grep -q 'commits_waiting' && ! grep -rq committed_at "$WCL/.sikstack/works" \
  && [ "$wc_rc7" = 1 ] && printf '%s\n' "$wc_o7" | grep -q "^mark-committed is for a linked checkout" && [ "$wc_t7" = "$wc_t8" ] \
  && ok "local mode: next prints no commits_waiting= line, no slice.json gains committed_at, and mark-committed is refused with nothing written" \
  || bad "local mode leaked the linked record -- rc=$wc_rc7 $(printf '%s\n' "$wc_ln" | grep commits_waiting) $(grep -rl committed_at "$WCL/.sikstack/works" | head -2)"
if grep -rqF "$WCK" "$WCA" "$WCL" "$WCW"/*.txt "$WCW/fake" 2>/dev/null; then bad "the workspace key leaked into the tree, the output or the request log"; fi
kill "$WC_PID" 2>/dev/null; wait "$WC_PID" 2>/dev/null
echo "commit-record test runtime: $(( $(date +%s) - wc_t0 ))s"
unset -f wc   # this test's wc() wrapper would shadow wc(1) for the tests after it

# ---------------------------------------------------------------------------
echo "== Test 26: the core flow -- a toy phase through the verbs that stay: phase and slice lifecycle, a section read and append, a typed stop that halts next and releases, the pass refused while the gate is required and uncleared, --waive needing --note, pr branch refusing a dirty switch, validate exiting 1 on a broken slice.json, the pass and the archive =="
# The pin a command rename must keep green: each verb is called only through its wrapper below, so a rename
# touches one line here. A fresh workspace (`sikstack init`) in its own repo; no other test's state is read.
newtmp CFT; CW="$CFT/ws"
mkws CW > "$CFT/install.txt" 2>&1 || bad "core flow: the fresh install failed"
CH="$CFT/ws"; cfg() { git -C "$CH" "$@"; }  # the product repo; CW is its .sikstack/
wf() { ( cd "$CW" && python3 "$ENG" "$@" 2>&1 ); }
wf_next() { wf next; }
wf_new_phase() { wf phase new "$@"; }
wf_new_slice() { wf slice new "$@"; }
wf_slice_start() { wf slice start "$1"; }
wf_slice_finish() { wf slice finish "$1" --outcome "$2"; }
wf_slice_status() { wf slice status "$@"; }
wf_section() { wf section "$@"; }
wf_gate_require() { wf gate "$1" require; }
wf_gate_waive() { wf gate "$1" waive "${@:2}"; }
wf_gate_open() { wf gate "$1" open --walkthrough "$2"; }
wf_gate_clear() { wf gate "$1" clear "${@:2}"; }
wf_review_pass() { wf review "$1" --verdict pass; }
wf_pr_branch() { wf pr branch "$1" --name "$2"; }
wf_check() { wf check --no-rebuild; }
wf_archive() { wf phase archive "$1"; }
cf_status() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["status"])' "$CW/works/phases/active/$1"; }
{ printf 'a\n' > "$CH/app.txt" && cfg add -A && cfg commit -qm base; } >/dev/null 2>&1 \
  || bad "core flow: the base commit failed"
# (1) the phase and slice lifecycle: a phase is made with DECOMP and REVIEW, a slice is made, started and finished with its outcome.
c1=$(wf_new_phase --phase P1 --name "Core" --objective "the core flow"); c1_rc=$?
c2=$(wf_slice_finish P1.DECOMP "planned"); c2_rc=$?
c3=$(wf_new_slice --phase P1 --slice P1.S1 --name "probe" --kind implementation --risk low); c3_rc=$?
c4=$(wf_slice_start P1.S1); c4_rc=$?; c4_st=$(cf_status P1/slices/P1.S1/slice.json)
[ "$c1_rc$c2_rc$c3_rc$c4_rc" = 0000 ] && [ -d "$CW/works/phases/active/P1/slices/P1.DECOMP" ] && [ -d "$CW/works/phases/active/P1/slices/P1.REVIEW" ] \
  && [ "$(cf_status P1/slices/P1.DECOMP/slice.json)" = done ] && [ "$c4_st" = in_progress ] \
  && grep -q '| planned |' "$CW/works/phases/active/P1/phase.md" \
  && ok "core flow: a new phase carries DECOMP and REVIEW; DECOMP finishes with its outcome in the ## Slices row; a new slice starts in_progress" \
  || bad "core flow: phase and slice lifecycle broke (rc $c1_rc/$c2_rc/$c3_rc/$c4_rc, S1 $c4_st) -- $c1 / $c2 / $c3 / $c4"
# (2) a section read and an append, one section at a time.
c5=$(wf_section P1 Now); c5_rc=$?
c6=$(printf -- '- core: a settled point\n' | wf_section P1 Decisions --append --file /dev/stdin); c6_rc=$?
c7=$(wf_section P1 Decisions); c7_rc=$?
[ "$c5_rc$c6_rc$c7_rc" = 000 ] && [ "$(printf '%s\n' "$c5" | head -1)" = '## Now' ] && ! printf '%s\n' "$c5" | grep -q '^## Decisions' \
  && printf '%s\n' "$c7" | grep -qx -- '- core: a settled point' && grep -qx -- '- core: a settled point' "$CW/works/phases/active/P1/phase.md" \
  && ok "core flow: section reads one section (## Now alone) and appends an entry that the next read and phase.md both show" \
  || bad "core flow: the section read or append broke (rc $c5_rc/$c6_rc/$c7_rc) -- $c5 / $c6 / $c7"
# (3) a typed stop: bare or half-typed is refused; typed, next prints WAITING ON OPERATOR and no dispatchable slice; leaving pending releases it.
c8b=$(wf_slice_status P1.S1 pending); c8b_rc=$?; c8b_st=$(cf_status P1/slices/P1.S1/slice.json)
c8=$(wf_slice_status P1.S1 pending --stop-kind decision); c8_rc=$?; c8_st=$(cf_status P1/slices/P1.S1/slice.json)
c9=$(wf_slice_status P1.S1 pending --stop-kind decision --on-words "the operator picks one"); c9_rc=$?
c10=$(wf_next); c10_rc=$?
c11=$(wf_slice_status P1.S1 in_progress); c11_rc=$?
c12=$(wf_next)
[ "$c8b_rc" = 1 ] && [ "$c8b_st" = in_progress ] && [ "$c8_rc" = 1 ] && [ "$c8_st" = in_progress ] && [ "$c9_rc$c10_rc$c11_rc" = 000 ] \
  && printf '%s\n' "$c10" | grep -q '^WAITING ON OPERATOR: slice P1.S1 is pending' && printf '%s\n' "$c10" | grep -qx 'waiting_on_operator=P1.S1' \
  && printf '%s\n' "$c10" | grep -qx 'stop_kind=decision' && printf '%s\n' "$c10" | grep -qx 'on_words=the operator picks one' \
  && ! printf '%s\n' "$c10" | grep -q '^current_slice=' \
  && ! printf '%s\n' "$c12" | grep -q 'WAITING ON OPERATOR' && printf '%s\n' "$c12" | grep -qx 'current_slice=P1.S1' \
  && ok "core flow: a bare or half-typed pending stop is refused unwritten; a typed pending stop makes next print WAITING ON OPERATOR with its kind and words and no slice, and in_progress releases it" \
  || bad "core flow: the typed stop did not halt and release next (rc $c8b_rc/$c8_rc/$c9_rc/$c10_rc/$c11_rc) -- $c8 / $c10 / $c12"
c13=$(wf_slice_finish P1.S1 "did the probe"); c13_rc=$?
[ "$c13_rc" = 0 ] && [ "$(cf_status P1/slices/P1.S1/slice.json)" = done ] && grep -q '| did the probe |' "$CW/works/phases/active/P1/phase.md" \
  && ok "core flow: slice finish marks the slice done and lands its outcome in the ## Slices row" || bad "core flow: finishing P1.S1 broke (rc $c13_rc) -- $c13"
# (4) the pass is refused while the gate is required and not cleared; (5) gate waive without --note is refused.
c14=$(wf_gate_require P1); c14_rc=$?
c15=$(wf_slice_start P1.REVIEW); c16=$(wf_review_pass P1); c16_rc=$?
c17=$(wf_gate_waive P1); c17_rc=$?
pj_req=$(python3 -c 'import json,sys; a=json.load(open(sys.argv[1])).get("acceptance") or {}; print(a.get("required"), a.get("note"))' "$CW/works/phases/active/P1/phase.json")
[ "$c14_rc" = 0 ] && [ "$c16_rc" = 1 ] && printf '%s\n' "$c16" | grep -q 'requires operator acceptance and the gate is not cleared' \
  && [ "$(cf_status P1/phase.json)" != done ] \
  && ok "core flow: review --verdict pass is refused while the gate is required and uncleared, and the phase stays open" \
  || bad "core flow: the pass was not refused behind the required gate (rc $c14_rc/$c16_rc, phase $(cf_status P1/phase.json)) -- $c14 / $c16"
[ "$c17_rc" = 1 ] && printf '%s\n' "$c17" | grep -q 'gate P1 waive requires --note' && [ "$pj_req" = "True None" ] \
  && ok "core flow: gate waive without --note is refused and the gate stays required" \
  || bad "core flow: gate waive without --note was not refused (rc $c17_rc, acceptance $pj_req) -- $c17"
# (6) pr branch refuses a switch that would carry uncommitted tracked changes: the branch and phase.json stay as they were.
c18_h0=$(sha "$CW/works/phases/active/P1/phase.json"); printf 'b\n' >> "$CH/app.txt"
c18=$(wf_pr_branch P1 feat/core); c18_rc=$?
c18_br=$(cfg branch --show-current); c18_h1=$(sha "$CW/works/phases/active/P1/phase.json"); cfg checkout -q -- app.txt
[ "$c18_rc" = 1 ] && printf '%s\n' "$c18" | grep -q 'uncommitted tracked changes a switch would carry onto feat/core: app.txt' \
  && [ "$c18_br" = main ] && [ "$c18_h0" = "$c18_h1" ] && ! cfg rev-parse -q --verify refs/heads/feat/core >/dev/null \
  && ok "core flow: pr branch refuses a dirty tracked tree, cutting no branch and leaving phase.json byte-identical" \
  || bad "core flow: pr branch did not refuse the dirty switch (rc $c18_rc, on $c18_br) -- $c18"
# (7) validate exits 1 on a broken slice.json, and 0 again once it is restored.
c19_sj="$CW/works/phases/active/P1/slices/P1.S1/slice.json"; cp "$c19_sj" "$CFT/slice.json.keep"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["status"]="no-such-status"; json.dump(d, open(sys.argv[1], "w"))' "$c19_sj"
c19=$(wf_check); c19_rc=$?
cp "$CFT/slice.json.keep" "$c19_sj"; c20=$(wf_check); c20_rc=$?
[ "$c19_rc" = 1 ] && printf '%s\n' "$c19" | grep -q '^Workflow validation failed' && printf '%s\n' "$c19" | grep -q 'no-such-status' \
  && [ "$c20_rc" = 0 ] && printf '%s\n' "$c20" | grep -q '^Workflow validation passed' \
  && ok "core flow: validate exits 1 naming a slice.json with an unknown status, and passes once it is restored" \
  || bad "core flow: validate did not catch the broken slice.json (rc $c19_rc, then $c20_rc) -- $(printf '%s\n' "$c19" | tail -3)"
# (8) the pass after the gate is opened and cleared with the operator's words (a clear without them is refused, nothing
# written; a waive with its note passes a second phase), then the archive.
c21=$(wf_gate_open P1 "walk the toy"); c21_rc=$?; c22=$(wf_next)
c23_h0=$(sha "$CW/works/phases/active/P1/phase.json"); c23n=$(wf_gate_clear P1 --note "walked it"); c23n_rc=$?; c23_h1=$(sha "$CW/works/phases/active/P1/phase.json")
c23=$(wf_gate_clear P1 --words "accept" --note "walked it"); c23_rc=$?
c23_w=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["acceptance"].get("words"))' "$CW/works/phases/active/P1/phase.json")
[ "$c23n_rc" = 1 ] && printf '%s\n' "$c23n" | grep -q -- "--words \"<the operator's literal words>\" is required" && [ "$c23_h0" = "$c23_h1" ] \
  && [ "$c23_rc" = 0 ] && [ "$c23_w" = accept ] \
  && ok "core flow: gate clear without --words is refused with phase.json byte-identical; with --words \"accept\" it records the words" \
  || bad "core flow: gate clear's words guard broke (rc $c23n_rc/$c23_rc, words $c23_w) -- $c23n / $c23"
c24=$(wf_slice_finish P1.REVIEW "reviewed"); c25=$(wf_review_pass P1); c25_rc=$?; c25_st=$(cf_status P1/phase.json)
c26=$(wf_archive P1); c26_rc=$?
[ "$c21_rc$c23_rc$c25_rc$c26_rc" = 0000 ] && printf '%s\n' "$c22" | grep -q '^WAITING ON OPERATOR: phase P1 is pending' \
  && [ "$c25_st" = done ] && [ ! -d "$CW/works/phases/active/P1" ] && ls -d "$CW"/works/phases/archived/*_P1_* >/dev/null 2>&1 \
  && ok "core flow: an open gate halts next; cleared, the pass sets the phase done and phase archive moves it to archived/" \
  || bad "core flow: the cleared pass or the archive broke (rc $c21_rc/$c23_rc/$c25_rc/$c26_rc, phase $c25_st) -- $c22 / $c25 / $c26"
c27=$( { wf_new_phase --phase P2 --name "Waived" --objective "a waived pass" && wf_slice_finish P2.DECOMP "planned" \
  && wf_gate_waive P2 --note "nothing the operator can see" && wf_slice_start P2.REVIEW && wf_slice_finish P2.REVIEW "reviewed" && wf_review_pass P2; } 2>&1 ); c27_rc=$?
c28=$(wf_check); c28_rc=$?
[ "$c27_rc" = 0 ] && [ "$(cf_status P2/phase.json)" = done ] && [ "$c28_rc" = 0 ] \
  && ok "core flow: a gate waived with its note passes the second phase, and the workspace validates after the archive" \
  || bad "core flow: the waived pass or the final validate broke (rc $c27_rc/$c28_rc) -- $(printf '%s\n' "$c27" | tail -3) / $c28"

# ---------------------------------------------------------------------------
echo "== Test 27: the plugin path -- the engine and adapter copied to a folder outside any repo read a host's .sikstack/ from the host and from a nested repo's subfolder, take the workspace SIKSTACK_ROOT names, write nothing into their own folders own folder (no works/, no __pycache__), and with no workspace above exits 2 with one line =="
newtmp PLW; PLE="$PLW/plugin/scripts"; PLH="$PLW/host"; PLA="$PLH/app/sub"
{ mkdir -p "$PLE" "$PLW/plugin/adapters/claude_code" && cp "$PLUGIN"/scripts/*.py "$PLE/" && cp "$PLUGIN/adapters/claude_code/adapter.py" "$PLW/plugin/adapters/claude_code/" && cp -R "$PLUGIN/templates" "$PLW/plugin/" \
  && mkhost "$PLH" \
  && mkdir -p "$PLA" && git -C "$PLH/app" init -q; } > "$PLW/setup.txt" 2>&1 || bad "plugin path: the fixture failed -- $(tail -3 "$PLW/setup.txt")"
# pl <cwd> <args>: the copied engine under a python that would write bytecode beside it (no opt-out, no prefix).
pl() { _d=$1; shift; ( cd "$_d" && env -u PYTHONDONTWRITEBYTECODE -u SIKSTACK_ROOT -u WORKFLOW_CMD PYTHONPYCACHEPREFIX= python3 -X pycache_prefix= "$PLE/workflow.py" "$@" ) 2>&1; }
plr() { _r=$1; _d=$2; shift 2; ( cd "$_d" && env -u PYTHONDONTWRITEBYTECODE -u WORKFLOW_CMD SIKSTACK_ROOT="$_r" PYTHONPYCACHEPREFIX= python3 -X pycache_prefix= "$PLE/workflow.py" "$@" ) 2>&1; }
pl_sig() { ( cd "$PLW/plugin" && find . | LC_ALL=C sort ); }
pl_s0=$(pl_sig); pl_h=$(cd "$PLH" && pwd -P); pl_w=$(cd "$PLW" && pwd -P)
pl1=$(pl "$PLH" next); pl1_rc=$?
pl2=$(pl "$PLA" phase new --phase P1 --name Plugin --objective "made from a repo subfolder"); pl2_rc=$?
pl3=$(pl "$PLA" next); pl3_rc=$?
pl4=$(plr "$PLH" "$PLW" next); pl4_rc=$?
pl5=$(pl "$PLW" next); pl5_rc=$?
pl6=$( cd "$PLA" && env -u PYTHONDONTWRITEBYTECODE -u SIKSTACK_ROOT -u WORKFLOW_CMD -u ANTHROPIC_BASE_URL PYTHONPYCACHEPREFIX= python3 -X pycache_prefix= "$PLW/plugin/adapters/claude_code/adapter.py" route P1.DECOMP 2>&1 ); pl6_rc=$?
[ "$pl6_rc" = 0 ] && printf '%s\n' "$pl6" | grep -qx 'route=high' && printf '%s\n' "$pl6" | grep -qx 'subagent_type=sikstack:slice-executor' \
  && ok "plugin path: the adapter beside the copied engine routes a slice of the nested host from a repo's subfolder" \
  || bad "plugin path: the adapter did not route from the plugin folder (rc $pl6_rc) -- $pl6"
[ "$pl1_rc$pl2_rc$pl3_rc$pl4_rc" = 0000 ] && [ "$(printf '%s\n' "$pl1" | head -1)" = "nested_host=$pl_h" ] \
  && [ -f "$PLH/.sikstack/works/phases/active/P1/phase.json" ] && printf '%s\n' "$pl3" | grep -q 'P1' && [ "$pl4" = "$pl3" ] \
  && printf '%s\n' "$pl1" | grep -q ': sikstack repo convention ' \
  && ok "plugin path: the copied engine reads the nested host from the host, writes and reads it from a repo's subfolder (its hints name it sikstack), and SIKSTACK_ROOT names it from outside" \
  || bad "plugin path: the copied engine did not find the host (rc $pl1_rc/$pl2_rc/$pl3_rc/$pl4_rc) -- $(printf '%s\n' "$pl1" | head -2) / $pl2 / $(printf '%s\n' "$pl3" | head -2) / $(printf '%s\n' "$pl4" | head -2)"
[ "$pl5_rc" = 2 ] && [ "$pl5" = "no sikstack workspace found from $pl_w: run \`sikstack init\` in the repo (or set SIKSTACK_ROOT)" ] \
  && ok "plugin path: with no workspace above, the copied engine exits 2 with one line" \
  || bad "plugin path: with no workspace above (rc $pl5_rc) -- $pl5"
[ "$(pl_sig)" = "$pl_s0" ] && ok "plugin path: nothing was written into the engine's own folder (no works/, no __pycache__)" \
  || bad "plugin path: the engine wrote into its own folder -- $(diff <(printf '%s\n' "$pl_s0") <(pl_sig) | tail -5 | tr '\n' ' ')"
# The design-critic's harness (P74 finding 2), run as the plugin loads it: ${CLAUDE_PLUGIN_ROOT} filled in with the
# copied plugin's folder, from the session's directory (the host), its import lines bind every engine name it calls
# and design_root() resolves under the host's .sikstack/. The plugin's own skills say the same for design-preview.
critic_harness() { ( cd "$1" && PYTHONDONTWRITEBYTECODE=1 python3 - "$PLUGIN/agents/design-critic.md" "$PLW/plugin" <<'PY'
import re, sys
text = open(sys.argv[1]).read().replace("${CLAUDE_PLUGIN_ROOT}", sys.argv[2])
block = re.search(r"```python\n(.*?)```", text, re.S).group(1).splitlines()
assert "workflow/scripts" not in "\n".join(block), "the harness still guesses workflow/scripts"
ns = {}
exec("\n".join(l for l in block[:3] if "import" in l), ns)
w = ns["w"]
missing = [n for n in ("design_root", "design_preview_server", "DesignBrowser", "design_preview_browser", "design_preview_click") if not hasattr(w, n)]
assert not missing, missing
assert str(w.design_root()).endswith("/.sikstack/docs/reference/design"), w.design_root()
PY
) 2>&1; }
ch_nest=$(critic_harness "$PLA"); ch_nest_rc=$?
[ "$ch_nest_rc" = 0 ] && ok "the design-critic's harness, with \${CLAUDE_PLUGIN_ROOT} filled in, imports the plugin's engine from a repo subfolder and binds design_root (under .sikstack/), design_preview_server, DesignBrowser, design_preview_browser and design_preview_click" \
  || bad "the design-critic's harness does not bind its names from the plugin (rc $ch_nest_rc) -- $(printf '%s\n' "$ch_nest" | tail -2)"

# ---------------------------------------------------------------------------
echo "== Test 28: close -- the close's fixed order against a stub gh: an uncleared required gate is refused first, writing nothing; pr record --url stores the draft's head, updatedAt and comment count and pr sync says whether the PR is unchanged since; a PR changed since its draft stops at the re-read; an unchanged one records the pass and stops at Ready, then walks to the landing step; a red check stops at the CI step; merged, it stops for the one commit, then reads close=done; zero GitHub writes =="
# A toy workspace (sikstack init) in its own repo (CLH; CLW is its .sikstack/); gh is a stub on PATH that answers canned files, logs every call and refuses the rest.
newtmp CLT; CLW="$CLT/ws"; CLG="$CLT/gh"; mkdir -p "$CLG"
mkws CLW > "$CLT/install.txt" 2>&1 || bad "close: the fresh install failed"
cat > "$CLG/gh" <<'STUB'
#!/bin/sh
D=$(cd "$(dirname "$0")" && pwd); printf '%s\n' "$*" >> "$D/gh.log"
case "$1 $2" in
  "pr view") cat "$D/pr-$(basename "$3").json" 2>/dev/null || { echo "GraphQL: Could not resolve to a PullRequest" >&2; exit 1; };;
  "pr checks") cat "$D/checks.json"; exit "$(cat "$D/checks.rc" 2>/dev/null || echo 0)";;
  *) echo "stub: refused $*" >&2; exit 9;;
esac
STUB
chmod +x "$CLG/gh"
cl() { ( cd "$CLW" && PATH="$CLG:$PATH" python3 "$ENG" "$@" 2>&1 ); }
clg() { git -C "$CLW" "$@"; }; CLH="$CLT/ws"; hg() { git -C "$CLH" "$@"; }
# cpr <state> <isDraft> <head> <updatedAt> <comments>: the one PR's canned gh pr view answer.
cpr() { printf '{"state":"%s","isDraft":%s,"mergedAt":%s,"baseRefName":"main","headRefOid":"%s","reviewDecision":null,"updatedAt":"%s","comments":[%s]}\n' \
  "$1" "$2" "$([ "$1" = MERGED ] && echo '"2026-11-20T10:00:00Z"' || echo null)" "$3" "$4" "$5" > "$CLG/pr-1.json"; }
cck() { printf '[{"name":"smoke","bucket":"%s"}]\n' "$1" > "$CLG/checks.json"; }
clj() { python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d = d.get(k) if isinstance(d, dict) else (d[int(k)] if isinstance(d, list) and len(d) > int(k) else None)
print(json.dumps(d, sort_keys=True))' "$CLW/works/phases/active/P1/phase.json" "$1"; }
clsig() { cat "$CLW/works/phases/active/P1/phase.json" "$CLW/works/events.jsonl" | sha_stdin; }
H1=1111111111111111111111111111111111111111; H2=2222222222222222222222222222222222222222
{ echo a > "$CLH/app.txt" && hg add app.txt && hg commit -qm base \
  && cl phase new --phase P1 --name "Close" --objective toy && cl gate P1 require && cl slice finish P1.DECOMP --outcome cut \
  && clg add -A && clg commit -qm p1 && cl pr branch P1 --name feat/close && echo b >> "$CLH/app.txt" && hg commit -qam "feat: b" \
  && cl slice start P1.REVIEW && : > "$CLW/works/phases/active/P1/slices/P1.REVIEW/result.md"; } > "$CLT/setup.txt" 2>&1 \
  || bad "close: the toy phase failed to set up -- $(tail -3 "$CLT/setup.txt")"
# (1) the draft's state: pr record --url reads it; pr sync compares against it.
cpr OPEN true $H1 2026-11-20T01:00:00Z '{"body":"details"}'
c_rec=$(cl pr record P1 --url https://github.com/acme/close/pull/1); c_s1=$(cl pr sync P1)
cpr OPEN true $H2 2026-11-20T01:00:00Z '{"body":"details"}'; c_s2=$(cl pr sync P1); cpr OPEN true $H1 2026-11-20T01:00:00Z '{"body":"details"}'
if printf '%s\n' "$c_rec" | grep -qx 'pr_draft_state=host:feat/close head=1111111 updated_at=2026-11-20T01:00:00Z comments=1' \
    && [ "$(clj pr.branches.0.head)" = "\"$H1\"" ] && [ "$(clj pr.branches.0.updated_at)" = '"2026-11-20T01:00:00Z"' ] && [ "$(clj pr.branches.0.comments)" = 1 ] \
    && printf '%s\n' "$c_s1" | grep -qx 'unchanged_since_draft=yes pr=host:feat/close' && printf '%s\n' "$c_s2" | grep -qx 'unchanged_since_draft=no pr=host:feat/close' \
    && [ "$(clj pr.branches.0.head)" = "\"$H1\"" ]; then
  ok "close: pr record --url stores the draft's head, updatedAt and comment count from gh pr view; pr sync prints unchanged_since_draft=yes on the same answer and no on a moved head, keeping the draft's record"
else bad "close: the draft's state wrong -- $c_rec / $c_s1 / $c_s2 / head $(clj pr.branches.0.head)"; fi
# (2) an uncleared required gate is refused before anything is read or written; gate clear without --words is refused unwritten.
cl gate P1 open --walkthrough "walk it" > /dev/null; c_g0=$(clsig); : > "$CLG/gh.log"
c_gate=$(cl close P1); c_gate_rc=$?; c_nw=$(cl gate P1 clear); c_nw_rc=$?; c_g1=$(clsig)
if [ "$c_gate_rc" = 1 ] && printf '%s\n' "$c_gate" | grep -q "^close P1: refused -- the acceptance gate is required and not cleared with the operator's words" \
    && [ "$c_nw_rc" = 1 ] && printf '%s\n' "$c_nw" | grep -q -- '--words "<the operator.s literal words>" is required' && [ "$c_g0" = "$c_g1" ] && [ ! -s "$CLG/gh.log" ]; then
  ok "close: a required gate not cleared with words is refused first (no gh call, phase.json and events unchanged), and gate clear without --words is refused unwritten"
else bad "close: the uncleared gate was not refused first (rc $c_gate_rc/$c_nw_rc) -- $c_gate / $c_nw / gh: $(cat "$CLG/gh.log")"; fi
# (3) cleared with words; a PR changed since its draft stops at the re-read, with no pass recorded.
cl gate P1 clear --words "accept" > /dev/null
cpr OPEN true $H2 2026-11-20T02:00:00Z '{"body":"details"}'; c_chg=$(cl close P1); c_chg_rc=$?
if [ "$c_chg_rc" = 0 ] && [ "$(clj acceptance.words)" = '"accept"' ] && printf '%s\n' "$c_chg" | grep -qx 'step=gate state=done -- cleared with the words '"'accept'" \
    && printf '%s\n' "$c_chg" | grep -qx 'step=reread state=stop' && printf '%s\n' "$c_chg" | grep -q '^stop=reread do=host:feat/close changed since its draft: read it (gh pr view https://github.com/acme/close/pull/1 --json title,body,commits,reviews,comments)' \
    && printf '%s\n' "$c_chg" | grep -qx 'step=pass state=due' && [ "$(clj status)" != '"done"' ]; then
  ok "close: gate clear --words records the words; a PR whose head moved since its draft stops at the re-read (the pass not recorded, the read-and-re-record steps printed)"
else bad "close: a changed PR did not stop at the re-read (rc $c_chg_rc) -- $c_chg"; fi
# (4) unchanged: the pass is recorded and the close stops at Ready; Ready (updatedAt moved) and green, it walks to the landing step.
cpr OPEN true $H1 2026-11-20T01:00:00Z '{"body":"details"}'; c_rd=$(cl close P1)
cpr OPEN false $H1 2026-11-20T03:00:00Z '{"body":"details"}'; cck pass; cl pr team --record solo --evidence "one owner" > /dev/null
c_ld=$(cl close P1)
if printf '%s\n' "$c_rd" | grep -qx 'step=pass state=done -- recorded' && printf '%s\n' "$c_rd" | grep -qx 'stop=ready do=gh pr ready https://github.com/acme/close/pull/1; then sikstack close P1' \
    && [ "$(clj status)" = '"done"' ] && [ "$(clj review.status)" = '"pass"' ] \
    && printf '%s\n' "$c_ld" | grep -qx 'step=ci state=done -- host:feat/close green' && printf '%s\n' "$c_ld" | grep -qx 'step=land state=stop' \
    && printf '%s\n' "$c_ld" | grep -q '^stop=land do=land host:feat/close by its repo.s custom' && [ "$(clj pr.branches.0.ci)" = '"green"' ]; then
  ok "close: a PR unchanged since its draft records the pass and stops at Ready (gh pr ready printed, never run); Ready and green, it walks to the landing step"
else bad "close: the unchanged walk wrong -- $c_rd / $c_ld"; fi
# (5) a red check stops at the CI step, naming the reopen.
cck fail; c_red=$(cl close P1)
printf '%s\n' "$c_red" | grep -qx 'step=ci state=stop' && printf '%s\n' "$c_red" | grep -q '^stop=ci do=CI is red on host:feat/close: the phase is done' \
  && printf '%s\n' "$c_red" | grep -qx 'step=land state=due' && [ "$(clj pr.branches.0.ci)" = '"red"' ] \
  && ok "close: a red check stops at the CI step (recorded ci=red) and names the reopen on the operator's word" || bad "close: a red check did not stop at CI -- $c_red"
# (6) merged: the close records it, checks, and stops for the one commit; committed, it reads close=done.
cpr MERGED false $H1 2026-11-20T04:00:00Z '{"body":"details"}'; c_mg=$(cl close P1); clg add -A >/dev/null 2>&1; clg commit -qm "chore: close" >/dev/null 2>&1; c_dn=$(cl close P1)
if printf '%s\n' "$c_mg" | grep -qx 'step=land state=done' && printf '%s\n' "$c_mg" | grep -qx 'step=check state=done' && printf '%s\n' "$c_mg" | grep -q '^stop=commit do=' \
    && [ "$(clj pr.branches.0.state)" = '"merged"' ] && [ "$(printf '%s\n' "$c_dn" | tail -1)" = close=done ] && printf '%s\n' "$c_dn" | grep -qx 'step=commit state=done'; then
  ok "close: a merged PR passes the landing step, check runs, the close stops for the one workflow commit, and once committed reads close=done"
else bad "close: the merged walk wrong -- $c_mg / $c_dn"; fi
# (7) zero GitHub writes: every call the stub saw is a read.
c_w=$(grep -cvE '^(pr view https://github\.com/[^ ]+ --json [a-zA-Z,]+|pr checks https://github\.com/[^ ]+ --json name,bucket)$' "$CLG/gh.log")
[ "$c_w" = 0 ] && [ "$(grep -c '' "$CLG/gh.log")" -ge 5 ] && ok "close: zero GitHub writes -- every one of the $(grep -c '' "$CLG/gh.log") calls the stub gh saw is a read (pr view --json, pr checks --json)" \
  || bad "close: the stub gh saw a call that is not a read -- $(grep -vE '^pr (view|checks) ' "$CLG/gh.log" | head -3)"
# (8) a worktree phase: close in the worktree commits the pass on the branch itself (commit-pass: `--only` the phase folder
# and the generated works/ files; the operator's tracked edit, staged file and untracked file stay as they were), so
# worktree gate opens; merged in the main checkout, close walks merge and teardown to close=done. At root (gate required,
# and waived with the pass recorded earlier), nested and on a multi-repo host. A phase with no worktree prints no commit-pass.
cwt() {  # <root|nested|multi> <required|waived> <dir>: prints one line, "ok" or what went wrong
  ( export GIT_AUTHOR_NAME=smoke GIT_AUTHOR_EMAIL=smoke@example.invalid GIT_COMMITTER_NAME=smoke GIT_COMMITTER_EMAIL=smoke@example.invalid
    H="$3/host"; L="$3/log.txt"; WF=.sikstack; mkdir -p "$3"
    g0() { mkdir -p "$1" && git -C "$1" init -q && git -C "$1" symbolic-ref HEAD refs/heads/main && echo a > "$1/a.txt" && git -C "$1" add -A && git -C "$1" commit -qm base; }
    case $1 in
      nested) g0 "$H" && mkhost "$H" > "$L" 2>&1 ;;
      multi) g0 "$H/alpha" && mkhost "$H" > "$L" 2>&1 && ( cd "$H" && python3 "$ENG" repo add alpha && python3 "$ENG" init ) >> "$L" 2>&1 ;;
    esac || { echo "install failed: $(tail -2 "$L")"; exit; }
    m() { ( cd "$H" && python3 "$ENG" "$@" 2>&1 ); }
    m phase new --phase P1 --name Wt --objective x >> "$L" && if [ "$2" = waived ]; then m gate P1 waive --note "no gate"; else m gate P1 require; fi >> "$L" \
      && git -C "$H/$WF" add -A && git -C "$H/$WF" commit -qm p1 || { echo "setup failed"; exit; }
    case $1 in root) m worktree start P1 ;; nested) m worktree start P1 --host-branch feat/wt ;;
      multi) m worktree start P1 --host-branch hb --repo alpha=feat/a --repo-base alpha=main ;; esac >> "$L" || { echo "worktree start failed"; exit; }
    WT=$(ls -d "$H"/.claude/worktrees/P1-*); BR=$(git -C "$WT/$WF" branch --show-current); w() { ( cd "$WT" && python3 "$ENG" "$@" 2>&1 ); }
    { w slice finish P1.DECOMP --outcome cut && w slice start P1.REVIEW && : > "$WT/$WF/works/phases/active/P1/slices/P1.REVIEW/result.md" \
      && w pr record P1 --waive --note "no product" && echo v1 > "$WT/$WF/op.md" && git -C "$WT/$WF" add -A && git -C "$WT/$WF" commit -qm "branch work" \
      && if [ "$2" = waived ]; then w slice finish P1.REVIEW --outcome done && w review P1 --verdict pass --reviewer smoke; \
         else w gate P1 open --walkthrough walk && w gate P1 clear --words accept; fi; } >> "$L" || { echo "branch work failed"; exit; }
    echo v2 > "$WT/$WF/op.md"; echo s > "$WT/$WF/op-staged.md"; git -C "$WT/$WF" add op-staged.md; echo u > "$WT/$WF/op-new.md"
    h0=$(git -C "$WT/$WF" rev-parse HEAD); dry=$(w close P1 --dry-run)
    [ "$(git -C "$WT/$WF" rev-parse HEAD)" = "$h0" ] && printf '%s\n' "$dry" | grep -q '^step=commit-pass state=due -- would commit ' || { echo "dry run: $dry"; exit; }
    c1=$(w close P1); files=$(git -C "$WT/$WF" show --name-only --format= HEAD | LC_ALL=C sort | tr '\n' ' ')
    want="backlog.md works/events.jsonl works/index.json works/phases/active/P1/phase.json works/phases/active/P1/phase.md works/phases/active/P1/slices/P1.REVIEW/slice.json works/state.json "
    printf '%s\n' "$c1" | grep -q "^step=commit-pass state=done -- committed [0-9a-f]\{7\} chore(works): record P1's pass on its branch" \
      && printf '%s\n' "$c1" | grep -q "^stop=merge do=the pass is committed on $BR; from this worktree: sikstack worktree gate P1 " \
      && [ "$(git -C "$WT/$WF" rev-parse HEAD^)" = "$h0" ] && [ "$files" = "$want" ] \
      && [ "$(git -C "$WT/$WF" status --porcelain | LC_ALL=C sort | tr '\n' '|')" = " M op.md|?? op-new.md|A  op-staged.md|" ] \
      || { echo "close in the worktree: $c1 / files: $files / status: $(git -C "$WT/$WF" status --porcelain | tr '\n' '|')"; exit; }
    w close P1 | grep -q "^step=commit-pass state=done -- nothing to commit: $BR already holds" && [ "$(git -C "$WT/$WF" rev-parse HEAD^)" = "$h0" ] \
      || { echo "a second close made another commit"; exit; }
    w worktree gate P1 | grep -qx 'GATE OPEN' || { echo "gate: $(w worktree gate P1 | grep '^GATE')"; exit; }
    git -C "$WT/$WF" add -A && git -C "$WT/$WF" commit -qm "operator: own files"   # the operator settles their own files
    [ -z "$(git -C "$H/$WF" status --porcelain -- works backlog.md)" ] || { git -C "$H/$WF" add works backlog.md && git -C "$H/$WF" commit -qm "chore(works): refresh"; }
    if ! git -C "$H/$WF" merge --no-ff -q "$BR" -m "merge(P1): Wt" >> "$L" 2>&1; then  # a generated file's conflict: take either side
      for f in $(git -C "$H/$WF" diff --name-only --diff-filter=U); do case $f in backlog.md|works/index.json|works/state.json) git -C "$H/$WF" checkout --theirs -- "$f" && git -C "$H/$WF" add -- "$f" ;; *) echo "merge conflict in $f"; exit ;; esac; done
      git -C "$H/$WF" commit -q --no-edit || { echo "merge commit failed"; exit; }
    fi
    c2=$(m close P1); git -C "$H/$WF" add works && git -C "$H/$WF" commit -qm "chore(works): close P1"; c3=$(m close P1)
    printf '%s\n' "$c2" | grep -qx 'step=merge state=done' && printf '%s\n' "$c2" | grep -qx 'step=teardown state=done' && printf '%s\n' "$c2" | grep -q '^stop=commit do=' \
      && [ "$(printf '%s\n' "$c3" | tail -1)" = close=done ] && [ ! -e "$WT" ] || { echo "main checkout: $c2 / $c3"; exit; }
    echo ok )
}
newtmp CWT
for c in "nested required" "nested waived" "multi required"; do
  set -- $c; r=$(cwt "$1" "$2" "$CWT/$1-$2" | tail -3)
  [ "$r" = ok ] && ok "close, a worktree phase ($1, gate $2): the close in the worktree commits the pass on the branch (only the phase folder and the generated works/ files, the operator's edited, staged and untracked files left as they were; --dry-run commits nothing, a second close nothing more), worktree gate opens, and after the merge the main checkout's close walks merge and teardown to close=done" \
    || bad "close, a worktree phase ($1, gate $2): $r"
done
! printf '%s\n' "$c_dn" | grep -q '^step=commit-pass' && [ "$(printf '%s\n' "$c_dn" | grep -c '^step=')" = 11 ] \
  && ok "close: a phase with no worktree prints the 11 steps, no commit-pass" || bad "close: a phase with no worktree printed a commit-pass step -- $c_dn"

# ---------------------------------------------------------------------------
echo "== Test 29: the plugin -- the engine roots in the nearest .sikstack/ and nowhere else, init is idempotent and hides .sikstack/, the guard hook's decisions, the compact-resume hook is silent outside a workspace, and no shipped text names an unprefixed agent or a workflow/scripts path =="
# (a) The finder (P74 finding 1). A copy of the plugin in a scratch folder outside every workspace: its own folder
# holds templates/ (and once a works/), never a .sikstack/, so from inside it the engine exits 2 with one line and
# writes nothing. Two nested repos each with a .sikstack/ (the inner made first: init refuses inside another workspace): a folder deep in the inner one roots there, a folder in
# the outer one outside the inner roots in the outer; SIKSTACK_ROOT names either; an old workflow/ install gets one
# pointer line.
newtmp FDW; cp -R "$PLUGIN" "$FDW/plugin"; mkdir -p "$FDW/plugin/works/phases"   # the old rule's bait
FE="$FDW/plugin/scripts/workflow.py"
fd_sig() { ( cd "$FDW" && find . -path ./outer -prune -o -type f -print | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done ); }
fd0=$(fd_sig)
fd_out=$( cd "$FDW/plugin" && python3 "$FE" next 2>&1 ); fd_rc=$?
fd_out2=$( cd "$FDW/plugin/scripts" && python3 "$FE" phase new --name x --objective y 2>&1 ); fd_rc2=$?
[ "$fd_rc" -eq 2 ] && [ "$fd_rc2" -eq 2 ] && [ "$(printf '%s\n' "$fd_out" | wc -l | tr -d ' ')" = 1 ] \
  && printf '%s\n' "$fd_out" | grep -q '^no sikstack workspace found from .*: run `sikstack init` in the repo (or set SIKSTACK_ROOT)$' \
  && [ "$(fd_sig)" = "$fd0" ] && [ ! -e "$FDW/plugin/.sikstack" ] && [ -z "$(find "$FDW/plugin" -name __pycache__)" ] \
  && ok "from inside the plugin's own folder (works/ planted there too), next and phase new exit 2 with one line naming sikstack init and write nothing" \
  || bad "the engine rooted in, or wrote into, its own folder (rc=$fd_rc/$fd_rc2) -- $fd_out / $fd_out2"
mkhost "$FDW/outer/a/inner" >/dev/null 2>&1 && mkhost "$FDW/outer" >/dev/null 2>&1 \
  && ( cd "$FDW/outer" && python3 "$FE" phase new --phase P1 --name Outer --objective o >/dev/null 2>&1 ) \
  && ( cd "$FDW/outer/a/inner" && python3 "$FE" phase new --phase P7 --name Inner --objective i >/dev/null 2>&1 ) \
  && mkdir -p "$FDW/outer/a/inner/src/deep" "$FDW/outer/b/c" || bad "finder probe: could not build the nested repos"
fd_in=$( cd "$FDW/outer/a/inner/src/deep" && python3 "$FE" next 2>&1 ); fd_out_=$( cd "$FDW/outer/b/c" && python3 "$FE" next 2>&1 )
fd_mid=$( cd "$FDW/outer/a" && python3 "$FE" next 2>&1 ); fd_st=$( cd "$FDW/outer/a/inner/.sikstack/works" && python3 "$FE" next 2>&1 )
fd_env=$( cd "$FDW" && SIKSTACK_ROOT="$FDW/outer/a/inner" python3 "$FE" next 2>&1 ); fd_env2=$( cd "$FDW" && SIKSTACK_ROOT="$FDW/outer/.sikstack" python3 "$FE" next 2>&1 )
fd_bad=$( cd "$FDW" && SIKSTACK_ROOT="$FDW/plugin" python3 "$FE" next 2>&1 ); fd_bad_rc=$?
printf '%s\n' "$fd_in" | grep -qx 'current_phase=P7' && printf '%s\n' "$fd_out_" | grep -qx 'current_phase=P1' \
  && printf '%s\n' "$fd_mid" | grep -qx 'current_phase=P1' && printf '%s\n' "$fd_st" | grep -qx 'current_phase=P7' \
  && printf '%s\n' "$fd_env" | grep -qx 'current_phase=P7' && printf '%s\n' "$fd_env2" | grep -qx 'current_phase=P1' \
  && [ "$fd_bad_rc" -eq 2 ] && printf '%s\n' "$fd_bad" | grep -q 'names no .sikstack/ folder' \
  && ok "the engine roots in the nearest .sikstack/ above the cwd (inner from deep in the inner repo and from inside its own .sikstack/, outer elsewhere), SIKSTACK_ROOT names either, and one naming no .sikstack/ exits 2" \
  || bad "the finder rooted wrong -- inner: $fd_in / outer: $fd_out_ / mid: $fd_mid / state: $fd_st / env: $fd_env / $fd_env2 / bad: $fd_bad"
mkdir -p "$FDW/old/workflow/works/phases/active" "$FDW/old/repo" && printf '{"schema": 1}\n' > "$FDW/old/workflow/.agentic-nested.json"
fd_old=$( cd "$FDW/old/repo" && python3 "$FE" next 2>&1 ); fd_old_rc=$?
[ "$fd_old_rc" -eq 2 ] && [ "$(printf '%s\n' "$fd_old" | wc -l | tr -d ' ')" = 1 ] && printf '%s\n' "$fd_old" | grep -q 'holds an old workflow/ install.*sikstack migrate' \
  && [ ! -e "$FDW/old/.sikstack" ] && ok "an old workflow/ install above the cwd gets one line pointing at sikstack migrate, exit 2, nothing written" \
  || bad "the old layout was read or not pointed at migrate (rc=$fd_old_rc) -- $fd_old"
# (b) init: a fresh repo gets .sikstack/ (its own repo, one commit), the exclude line once, and a second run changes
# nothing; the product repo's status stays clean; outside git, or inside another workspace, it refuses unwritten.
newtmp INW; git -C "$INW" init -q && git -C "$INW" commit -q --allow-empty -m start
in1=$( cd "$INW" && python3 "$ENG" init 2>&1 ); in1_rc=$?
in_sig() { ( cd "$INW" && find . -path ./.git -prune -o -type f -print | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done; sha .git/info/exclude ); }
in_s1=$(in_sig); in2=$( cd "$INW" && mkdir -p sub && cd sub && python3 "$ENG" init 2>&1 ); in2_rc=$?; in_s2=$(in_sig)
[ "$in1_rc" -eq 0 ] && [ "$in2_rc" -eq 0 ] && printf '%s\n' "$in1" | grep -q '^initialized: ' && printf '%s\n' "$in2" | grep -q '^already initialized: ' \
  && [ "$in_s1" = "$in_s2" ] && [ "$(grep -cx '/.sikstack/' "$INW/.git/info/exclude")" = 1 ] && [ -z "$(git -C "$INW" status --porcelain)" ] \
  && [ "$(git -C "$INW/.sikstack" log --oneline | wc -l | tr -d ' ')" = 1 ] && [ -z "$(git -C "$INW/.sikstack" status --porcelain)" ] \
  && [ -f "$INW/.sikstack/config.toml" ] && [ -f "$INW/.sikstack/backlog.md" ] && [ -f "$INW/.sikstack/docs/current/qa.md" ] \
  && [ ! -e "$INW/.sikstack/works/templates" ] && grep -q '"host_root": ".."' "$INW/.sikstack/.agentic-nested.json" \
  && ok "sikstack init makes .sikstack/ (its own repo, one commit; config.toml, backlog.md, the five docs, no templates copy), one /.sikstack/ exclude line, a clean product status; run again from a subfolder it changes nothing" \
  || bad "init or its second run went wrong (rc=$in1_rc/$in2_rc) -- $in1 / $in2 / $(git -C "$INW" status --porcelain)"
newtmp INX; inx=$( cd "$INX" && python3 "$ENG" init 2>&1 ); inx_rc=$?
mkdir -p "$INW/nested" && git -C "$INW/nested" init -q
iny=$( cd "$INW/nested" && python3 "$ENG" init 2>&1 ); iny_rc=$?
[ "$inx_rc" -eq 2 ] && printf '%s\n' "$inx" | grep -q 'not in a git repo' && [ -z "$(ls -A "$INX")" ] \
  && [ "$iny_rc" -eq 2 ] && printf '%s\n' "$iny" | grep -q 'already inside the workspace at' && [ ! -e "$INW/nested/.sikstack" ] \
  && ok "init refuses outside git, and inside another workspace's tree, with one line and nothing written" \
  || bad "init's refusals wrong (rc=$inx_rc/$iny_rc) -- $inx / $iny"
# (c) the guard hook (R5: a plugin's settings permissions are ignored): its PreToolUse JSON for each form.
gd() { python3 -c 'import json,sys; print(json.dumps({"hook_event_name":"PreToolUse","tool_name":sys.argv[1],"tool_input":{"command":sys.argv[2]}}))' "$1" "$2" \
  | python3 "$PLUGIN/hooks/guard.py" | python3 -c 'import json,sys; t=sys.stdin.read(); print(json.loads(t)["hookSpecificOutput"]["permissionDecision"] if t.strip() else "pass")'; }
gd_bad=""
for c in 'git push --force origin main' 'git push -f' 'git push -fu origin x' 'git -C repo push --force-with-lease origin x' 'git push --force-with-lease=main:abc origin' \
    'git push origin +main' 'git push origin +HEAD:refs/heads/x' 'rm -rf build' 'rm -fr build' 'rm -r -f build' 'rm -Rf /tmp/x' 'sudo rm -rf /' 'cd x && rm -rf y' 'echo ok; git push --force'; do
  [ "$(gd Bash "$c")" = deny ] || gd_bad="$gd_bad [deny? $c]"
done
for c in 'playwright-cli --version' 'playwright-cli -s=s goto http://127.0.0.1:3030' 'npm install -g @playwright/cli@0.1.25'; do
  [ "$(gd Bash "$c")" = allow ] || gd_bad="$gd_bad [allow? $c]"
done
for c in 'git push origin main' 'git push -u origin feat/x' 'git push origin --delete feat/x' 'rm -r build' 'rm -f x' 'ls -la' 'playwright-cli open && curl x' 'echo --force'; do
  [ "$(gd Bash "$c")" = pass ] || gd_bad="$gd_bad [pass? $c]"
done
[ "$(gd Read 'rm -rf /')" = pass ] || gd_bad="$gd_bad [non-Bash]"
gd_reason=$(python3 -c 'import json; print(json.dumps({"tool_name":"Bash","tool_input":{"command":"rm -rf x"}}))' | python3 "$PLUGIN/hooks/guard.py")
gd_junk=$(printf 'not json' | python3 "$PLUGIN/hooks/guard.py"; echo "rc=$?")
[ -z "$gd_bad" ] && printf '%s\n' "$gd_reason" | python3 -c 'import json,sys; o=json.load(sys.stdin)["hookSpecificOutput"]; assert o["hookEventName"]=="PreToolUse" and o["permissionDecisionReason"].startswith("sikstack guard: ") and "\n" not in o["permissionDecisionReason"], o' \
  && [ "$gd_junk" = "rc=0" ] && python3 -c 'import json,sys; h=json.load(open(sys.argv[1]))["hooks"]; assert [m["matcher"] for m in h["PreToolUse"]] == ["Bash"] and [m["matcher"] for m in h["SessionStart"]] == ["startup|resume", "compact"], h' "$PLUGIN/hooks/hooks.json" \
  && ok "the guard denies every force-push form (--force, -f, --force-with-lease, a +refspec) and rm -rf / -fr / -r -f, each with a one-line reason; allows playwright-cli and its pinned install alone; passes the rest, other tools and bad input through" \
  || bad "the guard hook decided wrong --$gd_bad / $gd_reason / $gd_junk"
# (d) the compact-resume hook: silent outside any workspace, the card inside one (from the session's cwd).
cr_none=$(cd "$FDW" && printf '{"source":"compact","cwd":"%s"}' "$FDW/plugin" | env -u CLAUDE_PROJECT_DIR python3 "$PLUGIN/hooks/compact_resume.py"; echo "rc=$?")
cr_in=$(cd "$FDW" && printf '{"source":"compact","cwd":"%s"}' "$FDW/outer/a/inner/src/deep" | env -u CLAUDE_PROJECT_DIR python3 "$PLUGIN/hooks/compact_resume.py" 2>&1)
[ "$cr_none" = "rc=0" ] && [ "$(printf '%s\n' "$cr_in" | head -1)" = "compaction=done source=compact" ] && printf '%s\n' "$cr_in" | grep -q '^pointer: phase P7 ' \
  && ok "the compact-resume hook prints nothing outside a workspace, and the card of the .sikstack/ that owns the session's cwd inside one" \
  || bad "the compact-resume hook wrong -- outside: $cr_none / inside: $cr_in"
# (e) the shipped text (C3): no skill, agent or contract line names the engine by a workflow/scripts path or a
# script path, a sync-agents step, or a plugin agent without its sikstack: prefix (a bare Explore reaches the
# built-in one); the bin/ commands exist and run.
if python3 - "$PLUGIN" <<'PY'
import re, sys
from pathlib import Path
root = Path(sys.argv[1])
files = sorted(list((root / "skills").rglob("*.md")) + list((root / "agents").glob("*.md")) + [root / "contract.md"])
agents = sorted(p.stem for p in (root / "agents").glob("*.md"))
assert agents == ["Explore", "code-reader", "design-critic", "design-drafter", "pr-reader", "slice-executor"], agents
hyph = "|".join(a for a in agents if "-" in a)
problems = []
for f in files:
    for n, line in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
        where = f"{f.relative_to(root)}:{n}"
        if re.match(r"^name:\s", line):
            continue
        if re.search(r"workflow/scripts|scripts/workflow\.py|adapters/claude_code/adapter\.py|(?<![\w-])adapter\.py\b|sync-agents|executors\.toml", line):
            problems.append(f"{where}: engine path: {line.strip()[:120]}")
        if re.search(r"(?<![\w:/.-])(" + hyph + r")(?![\w-]|\.md)", line):
            problems.append(f"{where}: unprefixed agent: {line.strip()[:120]}")
        if re.search(r"`Explore`|subagent_type[:=]\s*`?(Explore|" + hyph + r")\b", line):
            problems.append(f"{where}: unprefixed Explore or subagent_type: {line.strip()[:120]}")
assert not problems, "\n".join(problems)
PY
then ok "no shipped skill, agent or contract line names workflow/scripts, a script path, sync-agents or executors.toml, or a plugin agent without its sikstack: prefix"
else bad "a shipped line names an engine path or an unprefixed plugin agent (above)"; fi
bin_out=$( cd "$FDW/outer/b/c" && "$SK" next 2>&1 | grep -x 'current_phase=P1'; cd "$FDW/outer/b/c" && "$SKA" route --explore 2>&1 | grep -x 'subagent_type=sikstack:Explore' )
[ -x "$SK" ] && [ -x "$SKA" ] && [ "$(printf '%s\n' "$bin_out" | wc -l | tr -d ' ')" = 2 ] \
  && ok "bin/sikstack and bin/sikstack-adapter run the engine and the adapter as bare commands" || bad "the bin/ commands did not run -- $bin_out"
# (f) the plugin's manifest: valid JSON naming sikstack with a semver version; `claude plugin validate` where the CLI is installed (CI has none).
if python3 -c 'import json,re,sys; m=json.load(open(sys.argv[1])); assert m["name"]=="sikstack" and re.fullmatch(r"\d+\.\d+\.\d+", m["version"]), m' "$PLUGIN/.claude-plugin/plugin.json"; then
  ok "plugin.json names sikstack with a semver version"
else bad "plugin.json is not a sikstack manifest with a semver version"; fi
if command -v claude >/dev/null 2>&1; then
  pv=$(claude plugin validate "$PLUGIN" 2>&1); pv_rc=$?
  [ "$pv_rc" = 0 ] && ok "claude plugin validate passes on the plugin folder" || bad "claude plugin validate failed (rc $pv_rc) -- $(printf '%s\n' "$pv" | tail -3)"
else echo "note: claude CLI not installed; plugin validate skipped"; fi

# ---------------------------------------------------------------------------
echo "== Test 30: setup, the registration retry and the rules card -- setup registers {install_id, email, plugin_version} once per new email under one install id and sets only autoCompactWindow in the user settings; with the server down it finishes, marks the registration pending, and the next SessionStart hook run registers it and clears the mark; the card is the contract inside a .sikstack/ repo (at most 4,096 B) and one line elsewhere =="
newtmp SUW; printf 'setup-smoke\n' > "$SUW/key"
su_fake() {  # su_fake <name> [port]: a fake server logging into $SUW/<name>/, its port in $SUW/<name>.port; prints its PID
  python3 "$PLUGIN/tests/fake_hi2vi.py" --dir "$SUW/$1" --port-file "$SUW/$1.port" --key-file "$SUW/key" --project p --org o \
    --lifetime 300 ${2:+--port "$2"} > "$SUW/$1.txt" 2>&1 &
  _p=$!; for _ in $(seq 1 100); do [ -s "$SUW/$1.port" ] && break; sleep 0.1; done; echo "$_p"
}
su_reqs() { [ -f "$SUW/$1/requests.jsonl" ] && grep -c '"route": "installs"' "$SUW/$1/requests.jsonl" || echo 0; }
su_setup() { CLAUDE_CONFIG_DIR="$SUW/cfg" SIKSTACK_SERVER="$1" python3 "$ENG" setup --email "$2" --data-dir "$3"; }
mkdir -p "$SUW/cfg" && printf '{\n  "model": "opus",\n  "permissions": {\n    "allow": [\n      "Bash(ls:*)"\n    ]\n  },\n  "enabledPlugins": {\n    "x@y": true\n  }\n}\n' > "$SUW/cfg/settings.json"
cp "$SUW/cfg/settings.json" "$SUW/settings.before"
su_up=$(su_fake up); SUS="http://127.0.0.1:$(cat "$SUW/up.port")"
# (a) server up: one registration with exactly the three fields; the settings gain one line; a re-run sends nothing and
# keeps the id; a new email registers again under the same id.
( cd "$SUW" && su_setup "$SUS" a@example.com "$SUW/data" ) > "$SUW/a1.txt" 2>&1; su_rc=$?
su_id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["install_id"])' "$SUW/data/install.json" 2>/dev/null)
( cd "$SUW" && su_setup "$SUS" a@example.com "$SUW/data" ) > "$SUW/a2.txt" 2>&1; su_rc2=$?; su_n2=$(su_reqs up)
( cd "$SUW" && su_setup "$SUS" b@example.com "$SUW/data" ) > "$SUW/a3.txt" 2>&1; su_rc3=$?
su_id3=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["install_id"])' "$SUW/data/install.json" 2>/dev/null)
su_body=$(python3 - "$SUW/up/requests.jsonl" "$su_id" "$PLUGIN/.claude-plugin/plugin.json" <<'PY'
import json, sys
reqs = [json.loads(l) for l in open(sys.argv[1]) if '"route": "installs"' in l]
version = json.load(open(sys.argv[3]))["version"]
want = [{"install_id": sys.argv[2], "email": e, "plugin_version": version} for e in ("a@example.com", "b@example.com")]
ok = [r["body"] for r in reqs] == want and all(r["authorization"] is None and r["content_type"] == "application/json" for r in reqs)
print("ok" if ok else f"bad {[r['body'] for r in reqs]} want {want}")
PY
)
su_diff=$(diff "$SUW/settings.before" "$SUW/cfg/settings.json" | grep '^[<>]')
su_json=$(python3 -c 'import json,sys; a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2])); a["autoCompactWindow"]=500000; print(a==b)' "$SUW/settings.before" "$SUW/cfg/settings.json")
[ "$su_rc" = 0 ] && [ "$su_rc2" = 0 ] && [ "$su_rc3" = 0 ] && [ -n "$su_id" ] && [ "$su_id" = "$su_id3" ] && [ "$su_n2" = 1 ] && [ "$su_body" = ok ] \
  && grep -q '^registration: a@example.com registered with ' "$SUW/a1.txt" && grep -q 'already registered' "$SUW/a2.txt" \
  && [ "$su_diff" = '>   "autoCompactWindow": 500000,' ] && [ "$su_json" = True ] && grep -q 'autoCompactWindow: already 500000' "$SUW/a2.txt" \
  && [ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["state"])' "$SUW/data/registration.json")" = registered ] \
  && ok "setup registers exactly {install_id, email, plugin_version} (no auth) once per new email under one install id, and adds only the autoCompactWindow line to the user settings" \
  || bad "setup with the server up -- rc=$su_rc/$su_rc2/$su_rc3 id=$su_id/$su_id3 reqs-after-rerun=$su_n2 body=$su_body diff=[$su_diff] json=$su_json $(cat "$SUW/a1.txt")"
# (b) server down: setup still exits 0 and marks the registration pending; the next SessionStart hook run (the server up
# again at that address) registers it and clears the mark; a later run sends nothing.
su_gone=$(su_fake gone); su_gp=$(cat "$SUW/gone.port"); kill "$su_gone" 2>/dev/null; wait "$su_gone" 2>/dev/null
( cd "$SUW" && su_setup "http://127.0.0.1:$su_gp" c@example.com "$SUW/data2" ) > "$SUW/b1.txt" 2>&1; su_rc=$?
su_state=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["state"])' "$SUW/data2/registration.json" 2>/dev/null)
su_back=$(su_fake back "$su_gp")
su_hook() { printf '{"source":"startup","cwd":"%s"}' "$SUW" | env -u CLAUDE_PROJECT_DIR CLAUDE_PLUGIN_DATA="$SUW/data2" python3 "$PLUGIN/hooks/session_start.py"; }
su_h1=$(su_hook; echo "rc=$?"); su_n1=$(su_reqs back)
su_state2=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["state"])' "$SUW/data2/registration.json" 2>/dev/null)
su_h2=$(su_hook; echo "rc=$?"); su_nb=$(su_reqs back)
kill "$su_back" "$su_up" 2>/dev/null; wait "$su_back" "$su_up" 2>/dev/null
su_id2=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["install_id"])' "$SUW/data2/install.json" 2>/dev/null)
[ "$su_rc" = 0 ] && grep -q '^registration: pending -- ' "$SUW/b1.txt" && [ "$su_state" = pending ] \
  && [ "$(printf '%s\n' "$su_h1" | tail -1)" = rc=0 ] && [ "$su_n1" = 1 ] && [ "$su_state2" = registered ] && [ "$su_nb" = 1 ] \
  && grep -q "\"install_id\": \"$su_id2\", \"email\": \"c@example.com\"" "$SUW/back/requests.jsonl" \
  && ok "with the server down setup exits 0 and marks the registration pending; the next SessionStart hook run registers it once and clears the mark" \
  || bad "the pending registration -- rc=$su_rc state=$su_state/$su_state2 reqs=$su_n1/$su_nb hook=$su_h1 $(cat "$SUW/b1.txt")"
# (c) a missing settings file is made with the one key; a bad email or an unsubstituted data folder is refused, unwritten.
mkdir -p "$SUW/cfg2"; ( cd "$SUW" && CLAUDE_CONFIG_DIR="$SUW/cfg2" SIKSTACK_SERVER="http://127.0.0.1:$su_gp" python3 "$ENG" setup --email d@example.com --data-dir "$SUW/data3" ) >/dev/null 2>&1
su_bad=$( cd "$SUW" && python3 "$ENG" setup --email nope --data-dir "$SUW/data4" 2>&1; echo "rc=$?" )
su_bad2=$( cd "$SUW" && python3 "$ENG" setup --email e@example.com --data-dir '${CLAUDE_PLUGIN_DATA}' 2>&1; echo "rc=$?" )
[ "$(cat "$SUW/cfg2/settings.json")" = "$(printf '{\n  "autoCompactWindow": 500000\n}')" ] \
  && printf '%s\n' "$su_bad" | grep -q 'rc=2' && printf '%s\n' "$su_bad2" | grep -q 'rc=2' && [ ! -e "$SUW/data4" ] && [ ! -e "$SUW/\${CLAUDE_PLUGIN_DATA}" ] \
  && ok "setup makes a missing settings file with the one key, and refuses a bad email or an unsubstituted data folder with nothing written" \
  || bad "setup's edges -- $(cat "$SUW/cfg2/settings.json" 2>&1) / $su_bad / $su_bad2"
# (d) the card: the contract plus the start line inside a .sikstack/ repo (from a subfolder too), at most 4,096 B; one
# line outside any workspace and one naming migrate above an old install; the hook never fails on bad input.
mkhost "$SUW/repo" && mkdir -p "$SUW/repo/src/deep" "$SUW/none" "$SUW/old/workflow" && printf '{"schema": 1}\n' > "$SUW/old/workflow/.agentic-nested.json"
su_card() { printf '{"source":"startup","cwd":"%s"}' "$1" | env -u CLAUDE_PROJECT_DIR -u CLAUDE_PLUGIN_DATA python3 "$PLUGIN/hooks/session_start.py"; }
su_card "$SUW/repo/src/deep" > "$SUW/card.txt"; su_card "$SUW/none" > "$SUW/out.txt"; su_card "$SUW/old" > "$SUW/old.txt"
su_junk=$(printf 'not json' | env -u CLAUDE_PROJECT_DIR python3 "$PLUGIN/hooks/session_start.py" >/dev/null; echo "rc=$?")
su_bytes=$(wc -c < "$SUW/card.txt" | tr -d ' ')
python3 - "$SUW/card.txt" "$PLUGIN/contract.md" <<'PY' && su_cc=ok || su_cc=bad
import sys
card, contract = open(sys.argv[1]).read(), open(sys.argv[2]).read().rstrip("\n")
assert card.startswith(contract + "\n\n"), "the card does not open with the contract"
rest = card[len(contract) + 2:]
assert rest.count("\n") == 1 and "/sikstack:sik-mode" in rest, rest
for rule in ("Nothing is pushed, merged or paid for without the operator's word", "A sign-off is the operator's literal words",
             "The operator's own work is never touched", "Reports are truthful", "## Principles (steer by name)"):
    assert rule in card, rule
PY
[ "$su_cc" = ok ] && [ "$su_bytes" -le 4096 ] && [ "$(grep -c '' "$SUW/out.txt")" = 1 ] && grep -q 'sikstack is installed.*/sikstack:sik-mode' "$SUW/out.txt" \
  && [ "$(grep -c '' "$SUW/old.txt")" = 1 ] && grep -q 'sikstack migrate' "$SUW/old.txt" && [ "$su_junk" = rc=0 ] \
  && ok "the SessionStart card is the contract plus one start line inside a .sikstack/ repo ($su_bytes B <= 4,096), one line outside, one naming migrate above an old install; bad input exits 0" \
  || bad "the card -- contract=$su_cc bytes=$su_bytes out=$(cat "$SUW/out.txt") old=$(cat "$SUW/old.txt") junk=$su_junk"

# ---------------------------------------------------------------------------
echo "== Test 31: sikstack migrate -- refusals (uncommitted tracked changes, an install before v102, a target with .sikstack/) write nothing; the dry run writes nothing (a tree hash, the host's files and both .git folders included); --apply on a nested multi-repo host moves workflow/ to .sikstack/ (history kept: one cleanup commit, untracked files moved, the marker and every phase record byte for byte), carries executors.toml and link.json into config.toml, rewrites the exclude and CLAUDE.local.md blocks only, removes only the installer copies that match what it shipped, and next and check run; an at-root install gets a seeded .sikstack/ with one import commit =="
newtmp MGW; cp -R "$PLUGIN" "$MGW/plugin"; ME="$MGW/plugin/scripts/workflow.py"; MGA="$MGW/plugin/adapters/claude_code/adapter.py"
mg_tree() { python3 - "$1" <<'PY'
import hashlib, os, sys
root = sys.argv[1]; h = hashlib.sha256()
for d, dirs, files in os.walk(root):
    dirs.sort()
    for n in sorted(dirs + files):
        p = os.path.join(d, n)
        body = ("L" + os.readlink(p)).encode() if os.path.islink(p) else b"D" if os.path.isdir(p) else b"F" + open(p, "rb").read()
        h.update(os.path.relpath(p, root).encode() + oct(os.lstat(p).st_mode).encode() + hashlib.sha256(body).digest())
print(h.hexdigest())
PY
}
# The fixture: a multi-repo host made by the plugin (Tests 17's shape), then aged into a v102 nested install.
MGH="$MGW/host"; mkdir -p "$MGH" && git -C "$MGH" init -q && git -C "$MGH" commit -q --allow-empty -m start
for r in alpha beta; do mkdir -p "$MGH/$r" && git -C "$MGH/$r" init -q && printf '# rules\n' > "$MGH/$r/CLAUDE.md" && git -C "$MGH/$r" add -A && git -C "$MGH/$r" commit -qm init; done
( cd "$MGH" && python3 "$ENG" init && python3 "$ENG" repo add alpha && python3 "$ENG" repo add beta && python3 "$ENG" init \
  && python3 "$ENG" phase new --phase P1 --name Move --objective o && python3 "$ENG" slice new --phase P1 --slice S1 --name Build --risk low ) > "$MGW/mk.txt" 2>&1 || bad "migrate fixture: could not build the host -- $(tail -3 "$MGW/mk.txt")"
mg_next0=$( cd "$MGH" && python3 "$ENG" next 2>&1 | grep -E '^(current_phase|current_slice|next_slice)=' )
git -C "$MGH/.sikstack" add -A && git -C "$MGH/.sikstack" commit -qm "phase P1"
mv "$MGH/.sikstack" "$MGH/workflow"
python3 - "$MGH" "$MGW/plugin/scripts/migrate_v102.json" <<'PY'
import hashlib, json, os, sys
from pathlib import Path
host, manifest = Path(sys.argv[1]), Path(sys.argv[2])
w = host / "workflow"
sha = lambda t: hashlib.sha256(t.encode()).hexdigest()
def put(p, t):
    p.parent.mkdir(parents=True, exist_ok=True); p.write_text(t)
for f in ("scripts/workflow.py", "scripts/wf_store.py", "adapters/claude_code/adapter.py"):
    put(w / f, "# the old engine\n")
put(w / "CLAUDE.workspace.md", "# the old contract\n")
put(w / "executors.toml", '# routes\n[claude.mid]\nmodel = "sonnet"   # cheaper\neffort = "high"\n')
put(w / "works/.workspace-version.json", json.dumps({"workspace_version": 102}) + "\n")
os.replace(w / "backlog.md", w / "works/backlog.md")
(w / "config.toml").unlink()
put(w / "works/templates/intent.md", "shipped intent\n")
put(w / "works/templates/phase.md", "an edited phase template\n")
marker = json.loads((w / ".agentic-nested.json").read_text())
marker["installed"] = {"skills": ["agenda", "commit"], "agents": ["slice-executor"]}
(w / ".agentic-nested.json").write_text(json.dumps(marker, indent=2) + "\n")
put(host / ".claude/skills/commit/SKILL.md", "shipped commit skill\n"); put(host / ".claude/skills/commit/.gitignore", "*\n")
put(host / ".claude/skills/agenda/SKILL.md", "an edited agenda skill\n"); put(host / ".claude/skills/agenda/.gitignore", "*\n")
put(host / ".claude/agents/slice-executor.md", "shipped executor\n")
os.symlink("../../workflow/tools/mine", host / ".claude/skills/mine")
hook = 'cd "$CLAUDE_PROJECT_DIR" && python3 workflow/adapters/claude_code/adapter.py compact-resume || true'
put(host / ".claude/settings.local.json", json.dumps({"autoCompactWindow": 500000, "permissions": {"allow": ["Bash(python3 workflow/scripts/workflow.py:*)", "Read"]},
    "hooks": {"SessionStart": [{"matcher": "compact", "hooks": [{"type": "command", "command": hook, "timeout": 15}]}]}}, indent=2) + "\n")
put(host / "CLAUDE.local.md", "# my own notes, workflow/ stays here\n\n<!-- BEGIN agentic-workspace (nested) -->\nA private install of the agentic workspace: `workflow/` (its own git repo).\n\n@workflow/CLAUDE.workspace.md\n\n- Run `python3 workflow/scripts/workflow.py next`; commit with `git -C workflow commit`.\n<!-- END agentic-workspace (nested) -->\nmy tail line names workflow/ too\n")
ex = host / ".git/info/exclude"
ex.write_text("# git's own lines\n/mine-outside/\n# BEGIN agentic-workspace (nested)\n/workflow/\n/CLAUDE.local.md\n/.claude/settings.local.json\n"
              "/.claude/skills/agenda/\n/.claude/skills/commit/\n/.claude/skills/run-loop/\n/.claude/agents/slice-executor.md\n/alpha/\n/beta/\n# END agentic-workspace (nested)\n/.claude/skills/mine\n")
m = json.loads(manifest.read_text())
m["skills"] = {"commit": {"SKILL.md": sha("shipped commit skill\n"), ".gitignore": sha("*\n")},
               "agenda": {"SKILL.md": sha("the agenda skill as shipped\n"), ".gitignore": sha("*\n")}}
m["agents"] = {"slice-executor": sha("shipped executor\n")}
m["templates"] = {"intent.md": sha("shipped intent\n"), "phase.md": sha("the phase template as shipped\n")}
manifest.write_text(json.dumps(m))
PY
git -C "$MGH/workflow" add -A && git -C "$MGH/workflow" commit -qm "the old install"
mkdir -p "$MGH/workflow/notes" && printf 'mine, untracked\n' > "$MGH/workflow/notes/mine.md"
mg_count=$(git -C "$MGH/workflow" rev-list --count HEAD)
mg_marker=$(sha "$MGH/workflow/.agentic-nested.json")
mg_phases=$( cd "$MGH/workflow" && find works/phases -type f | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done )
mg_local0=$(cat "$MGH/CLAUDE.local.md")
# (a) the refusals, each writing nothing.
mg_t0=$(mg_tree "$MGH"); printf 'x\n' >> "$MGH/workflow/works/events.jsonl"; mg_t1=$(mg_tree "$MGH")
mg_r1=$( cd "$MGH/alpha" && python3 "$ME" migrate --apply 2>&1; echo "rc=$?" ); mg_t2=$(mg_tree "$MGH")
git -C "$MGH/workflow" checkout -q -- works/events.jsonl
newtmp MGO; mkdir -p "$MGO/workflow/works" && git -C "$MGO" init -q && git -C "$MGO/workflow" init -q && printf '{"schema": 1}\n' > "$MGO/workflow/.agentic-nested.json" \
  && printf '{"workspace_version": 95}\n' > "$MGO/workflow/works/.workspace-version.json" && git -C "$MGO/workflow" add -A && git -C "$MGO/workflow" commit -qm v95
mg_o0=$(mg_tree "$MGO"); mg_r2=$( cd "$MGO" && python3 "$ME" migrate --apply 2>&1; echo "rc=$?" ); mg_o1=$(mg_tree "$MGO")
printf '{"workspace_version": 102}\n' > "$MGO/workflow/works/.workspace-version.json" && git -C "$MGO/workflow" commit -qam v102 && mkdir "$MGO/.sikstack"
mg_o2=$(mg_tree "$MGO"); mg_r3=$( cd "$MGO" && python3 "$ME" migrate 2>&1; echo "rc=$?" ); mg_o3=$(mg_tree "$MGO")
[ "$mg_t1" = "$mg_t2" ] && printf '%s\n' "$mg_r1" | grep -q 'refused -- the old state repo workflow/ has uncommitted tracked changes (1 path(s), first works/events.jsonl)' && printf '%s\n' "$mg_r1" | grep -qx 'rc=1' \
  && [ "$mg_o0" = "$mg_o1" ] && printf '%s\n' "$mg_r2" | grep -q 'refused -- this install is v95, and migrate reads only the last bootstrap release, v102: update it first with that installer.s --update' \
  && [ "$mg_o2" = "$mg_o3" ] && printf '%s\n' "$mg_r3" | grep -q 'refused -- .*\.sikstack already exists' \
  && ok "migrate refuses uncommitted tracked changes, a v95 install (naming the installer's --update) and a target with .sikstack/, each writing nothing" \
  || bad "migrate's refusals -- $mg_r1 / $mg_r2 / $mg_r3"
# (b) the dry run writes nothing, the host's files and both .git folders included.
mg_t0=$(mg_tree "$MGH"); mg_d=$( cd "$MGH" && python3 "$ME" migrate 2>&1; echo "rc=$?" ); mg_t3=$(mg_tree "$MGH")
[ "$mg_t3" = "$mg_t0" ] && printf '%s\n' "$mg_d" | grep -qx 'rc=0' && printf '%s\n' "$mg_d" | grep -q '^dry run: nothing was written' \
  && printf '%s\n' "$mg_d" | grep -q '^- workflow/ -> .sikstack/, a rename' \
  && ok "migrate with no flag prints the plan and writes nothing (a tree hash of the host, its .git and the state repo's, before and after)" \
  || bad "the dry run wrote or failed -- $(printf '%s\n' "$mg_d" | tail -3)"
# (c) --apply on the nested multi-repo host.
( cd "$MGH" && python3 "$ME" migrate --apply ) > "$MGW/apply.txt" 2>&1; mg_rc=$?
MGS="$MGH/.sikstack"
mg_phases2=$( cd "$MGS" && find works/phases -type f | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$f")"; done )
mg_next1=$( cd "$MGH/beta" && python3 "$ME" next 2>&1 | grep -E '^(current_phase|current_slice|next_slice)=' )
mg_route=$( cd "$MGH" && python3 "$MGA" route 2>&1 | grep -x 'override=mid sonnet@high (default opus@medium)' )
mg_problems=""
[ "$mg_rc" = 0 ] || mg_problems="$mg_problems [rc=$mg_rc]"
[ ! -e "$MGH/workflow" ] && [ -d "$MGS/.git" ] || mg_problems="$mg_problems [moved]"
[ "$(git -C "$MGS" rev-list --count HEAD)" = $((mg_count + 1)) ] || mg_problems="$mg_problems [history $(git -C "$MGS" rev-list --count HEAD) vs $mg_count+1]"
[ "$(cat "$MGS/notes/mine.md")" = "mine, untracked" ] || mg_problems="$mg_problems [untracked file]"
for f in scripts adapters CLAUDE.workspace.md executors.toml works/.workspace-version.json works/backlog.md works/templates/intent.md; do
  [ ! -e "$MGS/$f" ] || mg_problems="$mg_problems [left $f]"; done
[ "$(cat "$MGS/works/templates/phase.md")" = "an edited phase template" ] && [ -f "$MGS/backlog.md" ] || mg_problems="$mg_problems [kept template/backlog]"
[ -n "$mg_route" ] || mg_problems="$mg_problems [route: no mid override]"
[ "$(sha "$MGS/.agentic-nested.json")" = "$mg_marker" ] && [ "$mg_phases2" = "$mg_phases" ] || mg_problems="$mg_problems [records changed]"
[ "$mg_next1" = "$mg_next0" ] && [ -n "$mg_next0" ] || mg_problems="$mg_problems [next: $mg_next1 vs $mg_next0]"
( cd "$MGH" && python3 "$ME" check --no-rebuild >/dev/null 2>&1 ) || mg_problems="$mg_problems [check]"
[ -z "$(git -C "$MGS" status --porcelain --untracked-files=no)" ] && [ -z "$(git -C "$MGH" status --porcelain)" ] || mg_problems="$mg_problems [dirty: $(git -C "$MGS" status --porcelain --untracked-files=no | head -2) $(git -C "$MGH" status --porcelain | head -2)]"
[ "$(sed -n '/# BEGIN/,/# END/p' "$MGH/.git/info/exclude" | tr '\n' ' ')" = "# BEGIN agentic-workspace (nested) /.sikstack/ /CLAUDE.local.md /.claude/settings.local.json /.claude/skills/agenda/ /alpha/ /beta/ # END agentic-workspace (nested) " ] \
  && grep -qx '/mine-outside/' "$MGH/.git/info/exclude" && grep -qx '/.claude/skills/mine' "$MGH/.git/info/exclude" || mg_problems="$mg_problems [exclude: $(tr '\n' ' ' < "$MGH/.git/info/exclude")]"
python3 - "$MGH/CLAUDE.local.md" "$mg_local0" <<'PY' || mg_problems="$mg_problems [CLAUDE.local.md]"
import sys
new, old = open(sys.argv[1]).read(), sys.argv[2] + "\n"
b, e = "<!-- BEGIN agentic-workspace (nested) -->", "<!-- END agentic-workspace (nested) -->"
assert new.split(b)[0] == old.split(b)[0] and new.split(e)[1] == old.split(e)[1], "text outside the markers changed"
inner = new.split(b)[1].split(e)[0]
assert "workflow/" not in inner and "@workflow" not in inner and "`sikstack next`" in inner and "git -C .sikstack commit" in inner and "`.sikstack/`" in inner, inner
PY
[ ! -e "$MGH/.claude/skills/commit" ] && [ ! -e "$MGH/.claude/agents/slice-executor.md" ] && [ "$(cat "$MGH/.claude/skills/agenda/SKILL.md")" = "an edited agenda skill" ] \
  && [ -L "$MGH/.claude/skills/mine" ] || mg_problems="$mg_problems [host copies]"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert "hooks" not in d and d["permissions"]["allow"]==["Bash(python3 workflow/scripts/workflow.py:*)","Read"] and d["autoCompactWindow"]==500000, d' "$MGH/.claude/settings.local.json" || mg_problems="$mg_problems [settings]"
grep -q '^keep: .claude/skills/agenda/ (edited since v102 shipped it' "$MGW/apply.txt" && grep -q '^left for you: .claude/skills/mine is a link into workflow/' "$MGW/apply.txt" \
  && grep -q '^sikstack check --no-rebuild: passed' "$MGW/apply.txt" && grep -q '^migrate=done' "$MGW/apply.txt" || mg_problems="$mg_problems [report]"
[ -z "$mg_problems" ] \
  && ok "migrate --apply on a nested multi-repo host: workflow/ renamed to .sikstack/ with its history (+1 cleanup commit) and untracked files, engine copies gone, executors.toml's override in config.toml, the marker and phase records byte for byte, the exclude and CLAUDE.local.md blocks rewritten and nothing outside them, only the matching installer copies removed, the old hook dropped, next unchanged and check passing" \
  || bad "migrate --apply (nested) --$mg_problems $(tail -5 "$MGW/apply.txt")"
# (d) a linked install: link.json becomes config.toml's [cloud] table, which the engine reads as the link (with no key
# in a scratch XDG_CONFIG_HOME, its next names that server and project and stops, so the migrate reports a problem).
newtmp MGL; newtmp MGX; mkhost "$MGL" >/dev/null 2>&1 && mv "$MGL/.sikstack" "$MGL/workflow" && rm -f "$MGL/workflow/config.toml" && mkdir -p "$MGL/workflow/.hi2vi" \
  && printf '{"workspace_version": 102}\n' > "$MGL/workflow/works/.workspace-version.json" \
  && printf '{"schema": 1, "server": "https://kb.example", "org_id": "org-9", "project_id": "proj-9", "linked_at": "2026-11-01T00:00:00Z"}\n' > "$MGL/workflow/.hi2vi/link.json" \
  && git -C "$MGL/workflow" add -A && git -C "$MGL/workflow" commit -qm old
( cd "$MGL" && XDG_CONFIG_HOME="$MGX" python3 "$ME" migrate --apply ) > "$MGW/linked.txt" 2>&1; mg_rc=$?
[ "$mg_rc" = 1 ] && [ ! -e "$MGL/.sikstack/.hi2vi/link.json" ] && grep -qx '\[cloud\]' "$MGL/.sikstack/config.toml" && grep -qx 'server = "https://kb.example"' "$MGL/.sikstack/config.toml" \
  && grep -qx 'org_id = "org-9"' "$MGL/.sikstack/config.toml" && grep -qx 'project_id = "proj-9"' "$MGL/.sikstack/config.toml" && grep -qx 'schema = 1' "$MGL/.sikstack/config.toml" \
  && grep -q "^  no workspace key for https://kb.example project proj-9 in $MGX/sikstack/workspace-keys.json (or the older $MGX/hi2vi/workspace-keys.json)" "$MGW/linked.txt" \
  && grep -q '^migrate=done-with-problems' "$MGW/linked.txt" && grep -qx '/.hi2vi/' "$MGL/.sikstack/.git/info/exclude" \
  && ok "migrate moves a linked install's .hi2vi/link.json into config.toml's [cloud] table, which the engine then reads as the link (no key here: next names its server and project, and migrate says it is done with problems)" \
  || bad "migrate (linked) -- rc=$mg_rc $(tail -6 "$MGW/linked.txt")"
# (e) an at-root install: a seeded .sikstack/ with one import commit; the repo's tracked files untouched.
MGR="$MGW/atroot"; mkhost "$MGW/seed" >/dev/null 2>&1 && ( cd "$MGW/seed" && python3 "$ENG" phase new --phase P3 --name Root --objective o >/dev/null )
mkdir -p "$MGR" && git -C "$MGR" init -q && cp -R "$MGW/seed/.sikstack/works" "$MGR/works" && mkdir -p "$MGR/docs" && cp -R "$MGW/seed/.sikstack/docs/current" "$MGR/docs/current" \
  && mkdir -p "$MGR/scripts" && printf '# old engine\n' > "$MGR/scripts/workflow.py" && printf '# CLAUDE.md\n' > "$MGR/CLAUDE.md" && printf 'app\n' > "$MGR/app.py" \
  && printf '{"workspace_version": 102}\n' > "$MGR/works/.workspace-version.json" && cp "$MGW/seed/.sikstack/backlog.md" "$MGR/works/backlog.md" \
  && printf '[claude.high]\nmodel = "fable"\n' > "$MGR/executors.toml" && git -C "$MGR" add -A && git -C "$MGR" commit -qm "at-root workspace"
mg_src=$(git -C "$MGR" rev-parse HEAD); mg_ls0=$(git -C "$MGR" ls-files | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$MGR/$f")"; done)
( cd "$MGR" && python3 "$ME" migrate --apply ) > "$MGW/root.txt" 2>&1; mg_rc=$?
mg_ls1=$(git -C "$MGR" ls-files | LC_ALL=C sort | while read -r f; do printf '%s %s\n' "$f" "$(sha "$MGR/$f")"; done)
mg_rn=$( cd "$MGR" && python3 "$ME" next 2>&1 | grep -x 'current_phase=P3' )
[ "$mg_rc" = 0 ] && [ "$(git -C "$MGR/.sikstack" rev-list --count HEAD)" = 1 ] && git -C "$MGR/.sikstack" log -1 --format=%s | grep -q "import the workspace from atroot at ${mg_src:0:12}" \
  && [ "$mg_ls0" = "$mg_ls1" ] && [ -z "$(git -C "$MGR" status --porcelain)" ] && [ "$(git -C "$MGR" rev-parse HEAD)" = "$mg_src" ] && [ -n "$mg_rn" ] \
  && grep -qx 'model = "fable"' "$MGR/.sikstack/config.toml" && [ ! -e "$MGR/.sikstack/works/.workspace-version.json" ] && [ ! -e "$MGR/.sikstack/works/backlog.md" ] \
  && grep -q '^left for you: the at-root files are still tracked in the repo; when you are ready: git rm -r -q -- .*scripts/workflow.py.*works' "$MGW/root.txt" \
  && [ -z "$(git -C "$MGR/.sikstack" status --porcelain)" ] && grep -q '^migrate=done' "$MGW/root.txt" \
  && ok "migrate --apply on an at-root install seeds .sikstack/ (one import commit naming the source commit, the routes carried), leaves every tracked file and the repo's HEAD as they were, and prints the git rm to run" \
  || bad "migrate --apply (at-root) -- rc=$mg_rc $(tail -6 "$MGW/root.txt")"

# ---------------------------------------------------------------------------
echo
if [ "$FAILS" -eq 0 ]; then
  echo "ALL SIKSTACK SMOKE TESTS PASSED"
  exit 0
else
  echo "$FAILS CHECK(S) FAILED"
  exit 1
fi
