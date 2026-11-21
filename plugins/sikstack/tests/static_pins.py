# The sikstack plugin's text pins: the shipped skills, agents, contract, templates and engine source hold the
# rules the smoke suite cannot run. Ported from the workspace suite's Test 0 (the installer's own pins cut).
# Run by tests/smoke.sh one top-level statement at a time, so every failing pin is reported, not the first.
from pathlib import Path
import sys
root = Path(sys.argv[1])  # the plugin folder
P = "${CLAUDE_PLUGIN_ROOT}"
CLAUDE_PLUGIN_ROOT = "{CLAUDE_PLUGIN_ROOT}"  # so an f-string pin "${CLAUDE_PLUGIN_ROOT}/..." reads literally
def _live():  # every shipped text file, keyed by the name the skills use for it
    out = {}
    for f in sorted((root / "skills").rglob("*")):
        if f.is_file(): out[f"{P}/skills/" + f.relative_to(root / "skills").as_posix()] = f.read_text(encoding="utf-8")
    for f in sorted((root / "agents").glob("*.md")): out[f"{P}/agents/" + f.name] = f.read_text(encoding="utf-8")
    for f in sorted((root / "templates/works").glob("*")): out["works/templates/" + f.name] = f.read_text(encoding="utf-8")
    for f in sorted((root / "scripts").glob("*.py")): out["scripts/" + f.name] = f.read_text(encoding="utf-8")
    out["adapters/claude_code/adapter.py"] = (root / "adapters/claude_code/adapter.py").read_text(encoding="utf-8")
    out["config.toml"] = (root / "templates/config.toml").read_text(encoding="utf-8")
    out["CLAUDE.md"] = (root / "contract.md").read_text(encoding="utf-8")
    return out
LIVE = _live()
def _shipped(pat):  # the files the old payload/ held: skills, agents, the contract
    return [*(root / "skills").rglob(pat), *(root / "agents").glob(pat), root / "contract.md"]
def _pay(rel):  # an old payload/ path, mapped into the plugin
    rel = str(rel)
    for a, b in (("claude/skills/", "skills/"), ("claude/agents/", "agents/")):
        if rel.startswith(a): return root / (b + rel[len(a):])
    return root / rel
root = Path(sys.argv[1])
skills = {p.parent.name for p in (root / "skills").glob("*/SKILL.md")}
assert len(skills) == 18, len(skills)  # 1.0.0: update-workspace and retrofit retired with the installer, sik-mode and setup added
def engine_src():  # the engine's source: every module, payload/scripts/*.py (the shell's engine_src)
    return "".join(f.read_text(encoding="utf-8") for f in sorted((root / "scripts").glob("*.py")))
def skill_dir_text(name):
    pre = f"${CLAUDE_PLUGIN_ROOT}/skills/{name}/"
    keys = sorted((k for k in LIVE if k.startswith(pre)), key=lambda k: (k != pre + "SKILL.md", k))
    return "\n".join(LIVE[k] for k in keys)
import re as _re
assert not any(k.startswith("${CLAUDE_PLUGIN_ROOT}/skills/do-next-slice/reference/") for k in LIVE), "do-next-slice ships a reference copy"
assert "${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phase/SKILL.md" in LIVE["${CLAUDE_PLUGIN_ROOT}/skills/do-next-slice/SKILL.md"]
for name in ("design-cowork", "do-whole-phase"):
    core = (root / "skills" / name / "SKILL.md").read_bytes()
    assert len(core) <= 8192, (name, len(core))  # re-attached whole after a compaction
    named = set(_re.findall(r"`reference/([\w.-]+\.md)`", core.decode()))
    shipped = {k.rsplit("/", 1)[1] for k in LIVE if k.startswith(f"${CLAUDE_PLUGIN_ROOT}/skills/{name}/reference/")}
    assert named and named == shipped, (name, sorted(named ^ shipped))
for gone in ("AGENTS.md", ".agents", ".codex"):
    assert not (root / gone).exists(), gone
model_invocable = {"design-cowork", "create-phase", "sik-mode"}  # the pr skill carries the marker too: callers read it by path
for name in sorted(skills):
    body = (root / "skills" / name / "SKILL.md").read_text()
    marker = "disable-model-invocation: true"
    assert (marker in body) == (name not in model_invocable), name
create_phase = (root / "skills/create-phase/SKILL.md").read_text()
assert "the agent when instructed" in create_phase
assert "Never on the agent's own initiative" in create_phase
assert "Invocation is not the gate; confirmation is." in create_phase
for required in ("`build-after`", "`design-only`", "`paired`", "## Design Style",
                 # v42: the mockup question beside the style. v43: creation says nothing about
                 # worktrees and only relays the hint -- it never pins and never starts one.
                 # P36.S6: the question now offers the working canvas as the default surface.
                 "Mockup: requested", "Mockup: on request", "will you sign on the canvas",
                 "Say nothing about worktrees", "Relay that hint; never act on it", "## The QA-sweep route"):
    assert required in create_phase, required
for gone in ("## The docs-phase route", "docs-debt", "--consolidates", "## Doc impact"):
    assert gone not in create_phase, gone
assert "literal approval when they return to the published canvas" in create_phase
assert "**in addition to** the canvas" in create_phase
assert "`drafter`" in create_phase and "Mockup: on request" in create_phase
for gone in ("ask which design tool", "Design tool: drafter", "Design tool: claude-design",
             "DesignSync", "design-deck", "design-register", "sign on the cards", "the drafted cards"):
    assert gone not in create_phase, gone
assert "## The explain route" in create_phase and "## Explain" in create_phase
for ref in ("explain-decomposition.md", "explain-chapter.md", "explain-review.md"):
    assert f"${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phase/reference/{ref}" in LIVE and f"${CLAUDE_PLUGIN_ROOT}/skills/do-next-slice/reference/{ref}" not in LIVE, ref
POINTER = "not written — run /knowledge:explain P<N> for a document, or ask it for a book"
for rel in ("claude/skills/do-whole-phase/playbooks/review.md", "claude/skills/review-phase/SKILL.md"):
    assert POINTER in _pay(rel).read_text(encoding="utf-8"), rel
OLD_POINTER = "run /knowledge:explain P<N> for one chapter, or create an explain phase for a book"
for p in [*_shipped("*.md"), root / "templates/docs/operations.md"]:
    assert OLD_POINTER not in p.read_text(encoding="utf-8"), p
for p in [*_shipped("*.md"), root / "templates/docs/operations.md"]:
    t = p.read_text(encoding="utf-8")
    assert "run /explain for this phase" not in t and "run /knowledge:explain for this phase" not in t, p
assert "must-cover" in create_phase and "0.10.0" in create_phase and "**A confirmed proposal.**" in create_phase
assert "- **unit**:" in create_phase and "- **phases**:" in create_phase and "- phases: P30, P33-n3" in create_phase
assert "**no `run:` line and no `mode:` line**" in create_phase
assert "- run: full" not in create_phase and "- mode: codebase" not in create_phase
assert "## The research route" in create_phase and "Research: <subject>" in create_phase
assert "--kind research --risk high" in create_phase and "**If the request carries a `Research: <subject>` block**" in create_phase
_chapter = (root / "skills/do-whole-phase/reference/explain-chapter.md").read_text(encoding="utf-8")
assert "knowledge:explain-critic" in _chapter and "kind: chapter" in _chapter and "trace-<key>.md" in _chapter
assert "**`model: sonnet`** when span 1 ran on an Opus model" in _chapter and "`model: opus`" in _chapter
assert "answers-<key>.md" in _chapter and "scratch: works/" not in _chapter
_decomp = (root / "skills/do-whole-phase/reference/explain-decomposition.md").read_text(encoding="utf-8")
assert "installed_plugins.json" in _decomp and "pages/.gitignore" in _decomp and "**0.10.0 or later**" in _decomp
assert "and dispatch no agent, `sikstack:Explore` included" in (root / "skills/do-whole-phase/playbooks/explain.md").read_text(encoding="utf-8")
for p in [*_shipped("*.md"), root / "templates/docs/operations.md"]:
    _t = p.read_text(encoding="utf-8")
    for gone in ("knowledge:web-researcher", "knowledge:code-researcher", "knowledge:gap-reviewer",
                 "knowledge:verifier", "no-research", "D0b: the preflight", "STOPPED: evidence gate",
                 "*Explain: permissions and the search cap*"):
        assert gone not in _t, (str(p), gone)
assert "**The explain carve-out" in (root / "skills/do-whole-phase/playbooks/explain.md").read_text(encoding="utf-8")
assert not (root / "agents/explain-critic.md").exists()
for required in ("every unit is a phase", "one confirmation", "Explain — confirm once; then it runs to publish.",
                 "start an explain from the main checkout", "`visibility: private` is absolute",
                 "The literal `unit` line", "**The required set, per unit:**", "- worktree: yes",
                 "- outline sign-off: off", "worktree start <P>` (nested: with no `--host-branch`",
                 "in **`auto`**", "--stop-kind decision", "operator-action", "**with no `unit` line**",
                 "§9.2 *The evidence for a book (an explain phase)*", "§3.2 *Permissions, and the payload builder*",
                 "**The acceptance gate, per unit:**", "**An explain phase is the one exception:**"):
    assert required in create_phase, required
for gone in ("A single chapter is not a phase", "**A book is a phase, and this route makes one.**"):
    assert gone not in create_phase, gone
_d = (root / "skills/do-whole-phase/reference/decomposition.md").read_text(encoding="utf-8")
assert "declares by its unit" in _d and "explain chapter: published private; a v2 is cheap" in _d
assert "always takes `--require` (the operator reads the book)" not in _d
_review = (root / "skills/do-whole-phase/reference/explain-review.md").read_text(encoding="utf-8")
for _txt, _pins in (
    (_decomp, ("## A document or a chapter", "works/phases/active/P<N>/doc/", "doc/pages/.gitignore",
               "--kind implementation --risk high --order 10", "## Run stops (every unit)",
               "feedback re-runs DECOMP from the dossier", "explain document: published private; a v2 is cheap",
               "outline sign-off: on", "under `## The book`", "§3.4 *D1: the evidence*", "`## Drawn from`")),
    (_chapter, ("## A document or a chapter: its one write slice", "mode: critique · kind: document",
                "`doc/answers.md`", "works/phases/active/P<N>/doc/body.md")),
    (_review, ("## Plan a document's or a chapter's review", "/api/documents/by-path/<rel_path>",
               "/app/orgs/<org>/<project>/<slug>", "**Otherwise, the API read-back,**", "A chapter's order check",
               "§8 *D9: the report*", "§9.1 *The book suggestion*", "(*An explain phase merges back by itself*)",
               "`book/research/answers-<key>.md`", "every `## Gaps` line of `doc/evidence.md`")),
):
    for _p in _pins:
        assert _p in _txt, _p
    assert "all eleven fields are present" not in _txt
assert _chapter.count("title: <") >= 2 and "title: <" in _chapter.split("kind: document", 1)[1], "title:"
assert "titled `P<N>: <phase name>`" not in create_phase and "taught twice" not in _review
codex_prose = {n for n in skills if "Codex" in skill_dir_text(n)}
assert codex_prose <= {"update-workspace"}, sorted(codex_prose)
assert "explain" not in skills, skills
for name in ("do-whole-phase",):
    body = skill_dir_text(name)
    for required in (
        "WAITING ON OPERATOR", "`kind: co-work`",
        "never pass `run_in_background: false`", "never glob `~/.claude/plans/`",
        "`plan only`", "gate <P> clear --words",
        # v34: the design slice runs inline -> dispatched -> inline, in one of three
        # named styles, and stops `pending` twice with different meanings.
        "`build-after`", "`design-only`",
        "`paired`", "PENDING #1", "PENDING #2", "## Design Style",
        # v47 (P26.S4): the drafting is dispatched to the design subagent, the mockup build is
        # the one span dispatched to a slice executor, the round's lifecycle and the operator's
        # words stay inline, and the round closes through the engine.
        "`sikstack:design-drafter`", "mockup build is the one span dispatched to a slice executor",
        "lifecycle and the operator's words stay inline",
        # P36.S6 / P46-nb / P47: a round runs in passes (a frame, the pages at once, a join; a
        # co-work slice designs one job), the critique dispatched to sikstack:design-critic, one PENDING stop per round. v61 (P37.S5): the
        # round procedure (the handoff, the drafter's prompt, the read-back, the publish, the closes)
        # lives once, in design-cowork's references, pinned there; the drivers point at them.
        "`sikstack:design-critic`", "Each round runs in passes, once per round", "its page drafters at once",
        "design-cowork/reference/opening.md", "`reference/publish.md`", "`reference/operator.md`",
        # P36.S1: a phase whose intent still says `Design tool: claude-design` is legacy -- the
        # drivers point at design-cowork's legacy rule instead of carrying the retired branch.
        "`Design tool: claude-design`", "re-confirm it on `drafter`",
        # v42: the mockup is on request, the operator's return closes the round, the
        # phase gate follows the mockup with a fixed waive note.
        "PENDING #2 exists only when a mockup was requested",
        "Mockup: requested",
        "design-only, no mockup: the operator signed each job on its canvas",
        # v43: a phase runs on this checkout unless the operator asks for a worktree;
        # the do-* skills never start one on their own initiative, and a hint is relayed,
        # not acted on. Merged back locally; the branch review records its two gate
        # sections as tagged notes.
        "unless the operator asked for a worktree", "worktree start <P>", "EnterWorktree",
        "`worktree start` on your own initiative", "## Gate sections (written at merge)",
        # lighter-rules: the integration (the local merge) is the close checklist's, pointed to, never restated.
        "by the close checklist, the one place it is written: `${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md`",
        # v35: just-in-time reads and the bounded notebook.
        "slice finish <slice_id> --outcome", "bounded phase notebook",
        "verdict block", "just in time",
        # v36: the research kind routes high by KIND (the DECOMP2 sequel lives in playbooks/decompose.md).
        "`research` and review always",
        # The entry-level notebook: the orchestrator reads it through section only, runs the
        # required step's notebook_move= lines before the next dispatch, and keeps the breakdown in a topic.
        "never with `Read`, `Edit` or `Write`", "`notebook_over_budget=`",
        "run each `notebook_move=` line under it, prefixed `sikstack`",
    ):
        assert required in body, (name, required)
    assert "sending it back whole" not in body, name
    # v42 negatives: the mandatory mockup, "not an approval" return, and the
    # opt-in framing of the phase branch are retired from both drivers.
    for gone in ("mechanical wait", "can no longer be waived", "suggestion, never a default",
                 "Four commits and two `pending` stops", "where opting the phase in was the ask",
                 # v47 (P26.S4): the DesignSync loop's push and manifest phrases stay out of both
                 # drivers. P36.S1: the claude-design branch and every DesignSync / design-register
                 # mention are retired from both drivers again.
                 "_ds_manifest", "never dispatched", "DesignSync", "design-register", "**`claude-design`**",
                 "**read back inline with", "Read the tool first", "Under claude-design",
                 "four commits, two", "one dispatched span", "Push the branch", "push the branch",
                 # P26.F1: the elided feedback step (no revision handoff, no read-back) is retired.
                 "in the same slice, re-dispatch the drafter",
                 # P36.S6: schema-1 cards, their address and the regroup are gone from both drivers.
                 "numbered card paths", "no regroup", "the cards stay addressed", "card set",
                 "design-close <round> --",
                 # v61 (P37.S5): the drivers no longer restate the round procedure; one drafter output.
                 "build-prompt.md", "read `result.md` and"):
        assert gone not in body, (name, gone)
    # v35: the per-slice re-read of the generated backlog dashboard is gone --
    # `next` prints the pointer. The only mentions left must say so.
    for ln in body.splitlines():
        if "works/backlog.md" in ln:
            assert "next" in ln and "pointer" in ln, (name, ln)
    # v46: mid is the default row; high needs a named trigger, and a fix to
    # mid-row work goes high (v83 retired the cheap row). The one-line/few-line scope for mid is retired.
    for required in ("--kind fix --risk <low|high>`",
                     "work the mid row got wrong never goes back to it"):
        assert required in body, (name, required)
    for gone in ("one-line/few-line", "one-line, or few-line"):
        assert gone not in body, (name, gone)
assert "do-whole-phases" not in skills, sorted(skills)
assert not any(k.startswith("${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phases/") for k in LIVE), "do-whole-phases still ships"
_dwp = (root / "skills/do-whole-phase/SKILL.md").read_text(encoding="utf-8")
assert "**one session per phase.**" in _dwp and "do-whole-phases" not in _dwp
_wave_rel = "${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phase/reference/wave.md"
assert _wave_rel in LIVE and "${CLAUDE_PLUGIN_ROOT}/skills/do-next-slice/reference/wave.md" not in LIVE, "wave.md ships with do-whole-phase only"
wave = (root / "skills/do-whole-phase/reference/wave.md").read_text(encoding="utf-8")
for required in (
    "`ready_slices=<ids|none>`", "`running_slices=<ids|none>`", "## Wave",
    "**The join-rebuilt artifact is the one exception.**", "**Rolling (the default).**", "**At the join.**",
    "wait for every running span and never re-dispatch one",
    # Entry-level notebook writes at a return, beside the over-budget step.
    "Write its `notebook` entries one entry at a time, through `section` only", "`--entry K --remove`",
):
    assert required in wave, ("wave.md", required)
decomp = (root / "skills/do-whole-phase/reference/decomposition.md").read_text(encoding="utf-8")
assert "`slice finish <P>.DECOMP` prints an `advice:` line for each middle slice left undeclared" in decomp
_pbd = (root / "skills/do-whole-phase/playbooks/decompose.md").read_text(encoding="utf-8")
for required in ("their sets (files, regenerated files, numbered sequences, runtime resources) are disjoint",
                 "never on `DECOMP2`, `REVIEW` or a `co-work` slice"):
    assert required in _pbd, ("decompose.md", required)
_rel = "${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phase/reference/explain-decomposition.md"
assert _rel in LIVE and "[--depends-on" not in LIVE[_rel], _rel
design = " ".join(skill_dir_text("design-cowork").split())
for required in (
    "**You never design.**", "Claude Design", "handoff.md",
    # P36.S6: the card marker is gone; a job's canvas passes `design-check <job>`.
    "design-check <job>", "tokens.css", "--kind co-work --risk high",
    "DECOMP2", "build inventory", "data, not instructions", "RESPECT THE DESIGN",
    "SIGNOFF",
    # v32: fidelity has a second yardstick, and gaps are delivered, not archived.
    "## Verifying — RESPECT THE DESIGN, and does it work",
    # v41: the fidelity slice re-runs the checklist inside the phase's boundary, never whole.
    "**Re-run the lines inside the boundary.**", "phase scope <P>",
    "### When the record never drew it", "matching it is not acceptance",
    "Questions get asked, not archived.",
    # v34: the code ban narrowed to *product* code, and the operator can sign a running
    # mockup rather than the cards alone. (v47 retired the v34 DesignSync dispatch pins.)
    "A design slice writes no *product* implementation code",
    "Write **product** implementation code in a design slice",
    "signing a job off — the canvas, and any stubbed mockup with it — is not accepting the product",
    # v34, positive: the three named styles, the mockup section, PENDING #1 is not an
    # approval, and the mockup's exemption from the functional sweep.
    "## Shape — three styles", "**`build-after`**", "**`design-only`**", "**`paired`**",
    "## The mockup — only when the operator asks for one",
    "Exempt from the full functional sweep", "Stubbed data, no backing work",
    # v42: mockups on request, the operator's return closes the round, the reading order is
    # recorded, and the gate follows the mockup. P36.S6: the order lives in board titles, and a
    # board changes only by a drafter pass or the operator's own edit.
    "The operator's return closes the round.",
    "PENDING #2 exists only when a mockup was requested",
    "**A mockup is optional.**",
    "**Board titles carry the reading order.**", "`01 · Page — Inbox`",
    "Mockup: requested", "Mockup: on request",
    "design-only, no mockup: the operator signed each job on its canvas",
    "Edit a board, `canvas.json`, a critique or a closed round's snapshot yourself",
    # v36: the doctrine names an instrument. lighter-rules: the instrument is playwright-cli,
    # the agent's own browser it installs, restarts and closes itself; only what it cannot have stops.
    "**With what — the instrument.**",
    "Drive that browser with **`playwright-cli`** (`@playwright/cli`),",
    "**The browser is never a blocker: the agent runs it whole.**",
    "`npm install -g @playwright/cli@0.1.25`",
    "`playwright-cli install-browser chrome-for-testing`",
    "`playwright-cli kill-all`",
    "`playwright-cli state-save <file>`",
    "Only what the agent cannot have stops a run: a credential, a sign-in, a paid account.",
    "**How to call it.** Call it plainly",
    "send a password's `fill` output to `/dev/null`",
    # v37: what the doctrine rejects is the pre-written suite, not the library --
    # what differs is who picks the next action.
    "in place of a pre-written assertion suite",
    "**Why the executor drives, and not a pre-written suite.**",
    "deciding every check in advance",
    "**`playwright-cli`** is the instrument, the agent's own",
    # v44 (P23): two pins whose contract text left for this skill -- the reading order (P36.S6:
    # board titles numbered 01..N as a set) and the instrument/runtime axis.
    "the numbers form `01..N` as a set",
    "the runtime halt fires on an absent or `UNFILLED` manifest",
    # v47 (P26.S1): the design record is an on-disk contract a separate dashboard reads; its
    # section names the root, the closed marker set, the lifecycle, the registry and the commands.
    # P36.S6: schema 2 -- jobs with canvas trees, one open round per job, immutable closed rounds.
    "## The design record — the on-disk contract (schema 2)",
    "**A closed round is immutable.**", "**At most one round is open per job.**",
    "`design-init", "`design-open", "`design-check", "`design-close <job>/<round> (--words",
    "`design-system", "`design-canvas", "`design-publish-plan <job>`", "`design-preview",
    # v47 (P26.S3): the loop runs on the files. The design subagent drafts, the operator decides;
    # the handoff says whether the round sets a new visual direction; the read-back runs design-check
    # itself; only literal words sign, feedback supersedes, and the round's lifecycle stays inline
    # while the drafting is dispatched. P36.S8C: frontend-design is retired from the drafter (its
    # useful lines carried, credited, in the drafter's craft), and the orchestrator still never loads it.
    "**The design subagent drafts, the operator decides.**", "subagent_type: sikstack:design-drafter",
    "`new visual direction: yes` or `no`",
    "Load `artifact-design` or `frontend-design` for product design co-work: they will make you design. The drafter loads neither",
    "**Never rest on the drafter's own `design_check` line.**",
    "SIGNOFF is taken on the operator's **literal** words",
    "`sikstack design-close <job>/<round> --superseded`",
    'design-close <job>/<round> --words "<their literal words>"',
    "the round's lifecycle and the operator's words stay inline",
    # P36.S6: the schema-2 Artifact loop (P46-nb: one connected group per slice; P47: a frame, the pages at once, a join); critique is
    # opt-in per job, decided at DECOMP; the judge runs beside the drafter's next pass and is skipped
    # under a proxy; only the main thread publishes (from design-publish-plan), never forcing over an
    # operator's edit; one PENDING stop per round; the session's words are the record; the working
    # canvas replaces the mockup by default; the system is re-synced from code with tokens.css; and
    # built canvases are deleted only on the operator's yes.
    "**The passes — a frame, the pages at once, a join.**", "**One design slice is one connected group, one job:**",
    "**A one-page round skips the frame and the join:**", "**Publish only after the join.**",
    "**Foundations come first.**", "`off | critic | critic+judge`, unset = `off`",
    "**`critique: <level>`**", "**beside the drafter's answer pass**", "**`skip=yes`**",
    "**Only the main thread publishes**", "**Never `force`.**", "## PENDING #1 — one stop per round",
    "**The session's words are the record.**", "**The working canvas replaces the in-product mockup by default.**",
    "**Every sync writes `tokens.css`**", "**after the build slice that implemented a signed job lands**",
    "You delete one only on the operator's yes", "The loop needs the `Artifact` tool on the main thread",
    "**The three paths:**", "**Collected taste, never invented:**", "`[claude.critic]` row",
    # P36.S1: the bundle import stays as a drafter input (P36.S6: an operator attachment), and the
    # claude-design folder is a legacy record with its own short note and legacy rule.
    "### Operator attachments", "an exported Claude Design bundle",
    "a design slice authorizes no `git push`",
    "## Design tool", "**`drafter` is the only design tool.**", "**Legacy rule.**",
    "Design tool: claude-design", "re-confirm the phase on `drafter`",
    "An absent `Design tool:` line reads as `drafter`",
    "### Legacy record: claude-design/", ".sikstack/docs/reference/design/claude-design/",
    "**`claude-design/` is outside schema 2**", "### Legacy record: schema1/",
    "sikstack design-migrate --apply", "| `design-migrate [--to 2] [--apply]` |",
    "sikstack design-migrate --to 2",
    # P36.S8C: the approved design recipe. One critic pass, then one drafter answer pass (the judge
    # beside it, its upheld items one short pass); the handoff carries the operator's bar from bar.md,
    # prototype first, a target for every link, and one direction unless the operator asked.
    "one critic pass, then at most one drafter answer pass. There is no second critic pass.",
    "Its **upheld** items get **one more short drafter pass**",
    "**`## The operator's bar`**, a heading of its own.", "`none beyond the shipped bar`",
    "├── bar.md", "**Prototype first:**", "**Every link has a target in scope.**",
    "**One direction unless the operator asked for options.**",
    "a critic pass took 25–36 minutes on a flow-board job",
    # Moved from the drivers' pins (v61, P37.S5): the rule lives here once.
    "write the new round's handoff", "The new round edits the job's canvas in place",
    "line, the round address `<job>/<round>` and a `pass:` line", "`new visual direction: yes` or `no`",
    # v61 (P37.S5): the design lifecycle as engine one-liners and a slimmer record. The read-back
    # fetches only what the listing names; the engine writes SIGNOFF.md and one word signs every job
    # presented; a superseding round re-drafts with critique off; the stop report is a short chat
    # message; the slice's brief once, a delta per round; one drafter output; repo-relative paths only.
    "design-readback <job> --listing <file|->", "design-readback <job> --fetched <dir>",
    "`--fetched <dir> --apply`", "sikstack design-sign --slice <S> --words",
    "**All or nothing:**", "**Never write `SIGNOFF.md` yourself**",
    "**A superseding round's critique is off by default**",
    "**The stop report** is a chat message, never a file in the record",
    "**At most about 5 decisions**", '**Everything else is one "decided as drawn" list**',
    "**signs everything presented** (`design-sign`)",
    "**The slice's brief, once per slice: `waves/<slice>/brief.md`**", "**Each round's `handoff.md`, a short delta**",
    "**What you read of a span: its verdict block, and the round `result.md`'s `## Summary`**",
    "**One drafter output per round: `result.md`**", "**Repo-relative paths only.**",
    "**The notebook gets one gist line per signed job**", "| `design-sign --slice S --words \"…\"` |",
    # P46-nb: one connected group per co-work slice, one canvas and one artifact per round; a
    # legacy multi-job slice finishes as drawn. P47 (OQ1): a small unrelated surface may share the
    # slice's canvas, unlinked; a bigger unrelated group stays a co-work slice of its own.
    "**One connected group, one canvas.**", "**A small unrelated surface of the same phase may share a slice's canvas:**",
    "A bigger unrelated group is a co-work slice of its own, never a second job of a slice.",
    "**Never `--new-job` for another surface:**", "### Legacy record: a multi-job slice", "**It finishes as drawn:**",
):
    assert required in design, required
assert "**A wave choice**" not in design, "**A wave choice**"
for rel in ("claude/skills/do-whole-phase/reference/decomposition.md", "claude/skills/do-whole-phase/playbooks/decompose.md"):
    _t = _pay(rel).read_text(encoding="utf-8")
    for gone in ("one job per surface", "a wave of about 3–4 jobs", "each slice's jobs with their critique level"):
        assert gone not in _t, (rel, gone)
_t = (root / "skills/do-whole-phase/playbooks/decompose.md").read_text(encoding="utf-8")
assert "each co-work slice's one job with its critique level" in _t and "co-work slice's jobs with their critique levels" not in _t
_t = (root / "skills/do-whole-phase/SKILL.md").read_text(encoding="utf-8")
assert "stops `pending` once per round" in _t and "once per wave" not in _t
assert "is its spans:** one drafter per job at once" not in skill_dir_text("do-whole-phase")
assert "a design wave's spans" not in (root / "skills/do-whole-phase/reference/wave.md").read_text(encoding="utf-8")
_t = engine_src()
assert "or pass --new-job for another" not in _t and "merge them into one connected job with --new-job" in _t
for gone in ("**Write `SIGNOFF.md`** in the round folder", "and `build-prompt.md`, the", "`read` the canvas's files with `out_dir` and diff"):
    assert gone not in design, gone
for gone in ("cap 3", "repeated findings", "**the cap:**", "`repeated`", "**The one exception:**",
             "only licence for `frontend-design`", "whether it used", "passes 02–03"):
    assert gone not in design, gone
for gone in ("### Under claude-design", "### Under drafter", "## The claude-design record",
             "Design tool — drafter or claude-design", "Design tool: drafter | claude-design",
             "DesignSync", "design-register", "AGENTIC_DESIGN_REGISTRY", "AGENTIC_DESIGN_DECK_URL",
             "Connect GitHub", "_ds_manifest", "**claude-design:**", "**drafter:**", "dashboard",
             # P36.S6: the schema-1 card loop is gone -- the marker, the review address, the regroup,
             # the per-project open-round rule, and the two-span dispatch.
             "@dsCard", "⏳", "regroup", "card set", "At most one round is open per project",
             "**Two spans are dispatched:**", "**The drafter loop never requires a claude.ai account**"):
    assert gone not in design, gone
for gone in ("cuts the build slices once the design has landed", "one `co-work` slice each",
             "in the round's record *and* in `phase.md`", "under its own `design/` tree instead",
             "**The workspace never requires a claude.ai account"):
    assert gone not in design, gone
raw_design = (root / "skills/design-cowork/SKILL.md").read_text()
front = raw_design.split("---\n", 2)[1]
allowed = next(ln for ln in front.splitlines() if ln.startswith("allowed-tools:"))
assert "DesignSync" not in allowed and "Agent" in allowed, allowed
tools = [t.strip() for t in allowed.split(":", 1)[1].split(",")]
assert "Artifact" in tools and "ArtifactComments" in tools, allowed
desc = next(ln for ln in front.splitlines() if ln.startswith("description:"))[len("description: "):]
assert ": " not in desc, desc
for required in ("the design subagent drafts, the operator decides",
                 "Use when a phase or slice touches a design system, a redesign, mockups"):
    assert required in desc, required
for gone in ("the operator designs in Claude Design", "claude-design", "DesignSync"):
    assert gone not in desc, gone
assert "Claude Design + the operator" not in desc, desc
import re
workflow_src = engine_src()
for const in ("DESIGN_ROOT_REL", "DESIGN_LEGACY_DIR"):
    value = re.search(r'^' + const + r' = "([^"]+)"$', workflow_src, re.M).group(1)
    assert value in design, (const, value)
for gone in ("DESIGN_REGISTRY_ENV", "DESIGN_REGISTRY_DEFAULT", "DESIGN_DECK_URL_ENV", "design-register",
             "design_deck_hint", "AGENTIC_DESIGN_REGISTRY", "AGENTIC_DESIGN_DECK_URL"):
    assert gone not in workflow_src, gone
allowed = re.search(r'^DESIGN_ALLOWED_REFS = \(([^)]*)\)$', workflow_src, re.M)
assert allowed, "DESIGN_ALLOWED_REFS"
allowed = re.findall(r'"([^"]*)"', allowed.group(1))
assert allowed and "/_blob/" in allowed, allowed
bullet = design.split("- **References stay inside the canvas.**", 1)[1].split(" - **", 1)[0]
for ref in allowed + ["{{hole}}", "ds/<ns>/…"]:
    assert "`" + ref + "`" in bullet, (ref, bullet)
for term in ("relative path inside `project/`", "`..`"):
    assert term in bullet, (term, bullet)
assert "../tokens.css" not in bullet and "- **Self-contained.**" not in design, bullet
drafter_rule = " ".join((root / "agents/design-drafter.md").read_text().split())
drafter_rule = drafter_rule.split("**The reference rule:**", 1)[1].split(" - **", 1)[0]
for ref in allowed + ["{{hole}}", "ds/<ns>/…"]:
    assert "`" + ref + "`" in drafter_rule, (ref, drafter_rule)
for term in ("relative path inside `project/`", "`..`"):
    assert term in drafter_rule, (term, drafter_rule)
assert "../tokens.css" not in drafter_rule and "**Keep every card self-contained.**" not in drafter_rule, drafter_rule
assert "A card references nothing relative except `../tokens.css`. " not in design
drafter = " ".join((root / "agents/design-drafter.md").read_text().split())
for required in ("`new visual direction: yes` in the handoff licenses setting a new look; you still build it as **one** direction.",
                 "If the `new visual direction` line is missing, extend the established look and name the missing line in `open_questions`.",
                 "appear only when the handoff quotes the operator asking for options",
                 "licensed under the Apache License, Version 2.0", "That skill is not loaded.",
                 # P36.S8C: the recipe -- flow boards, the per-page state bar, links in the prototype,
                 # no decorative SVG, the detail and Toss rules, and the checks run with --click.
                 "**Flow boards: the clicked item is the item shown.**", "### The state bar (on every interactive Page)",
                 "**only that page's presets**", "A preset never moves to another page",
                 "**Every link stays in the prototype.**", "Decorative SVG artwork",
                 "**Controls never change size or move what is around them when they show state**",
                 "Scope page link colors to text links (`a:not([class])`)",
                 "**Toss-level care (the rules, never Toss's look).**",
                 "**Fix every `check=` line before you return**", "--strict`, with **no `--out`**",
                 "**never a reason to fold a component's states into a static board**",
                 # P46-nb: the connected canvas opens on its entry Page.
                 "**The connected canvas.**", "board 01 is the **entry Page**, `Main.dc.html`",
                 # P47: a round drafts in three passes, named on the dispatch's one pass line.
                 "`pass: frame | page <slug> | join`", "### Frame rules (`pass: frame`)",
                 "### Page rules (`pass: page <slug>`)", "### Join rules (`pass: join`)",
                 # P47-p5.F1: the frame's fixture covers every entity a page shows, lists or links to; an entity
                 # it lacks is a frame gap; the join opens each in-round entity's own drawn item.
                 "every named entity a page shows, lists or links to (every row's destination, every linked item)",
                 "an entity the fixture lacks included", "a link to an entity of this round opens that entity's own drawn item"):
    assert required in drafter, required
assert "the shared fixture (every entity a page shows, lists or links to, with its figures)" in design, "drafting.md frame pass: fixture coverage"
for required in ("**The level is `off` unless the operator asks for a critic**",
                 "**One measured round, not a norm**", "16 spans, $71.50, 3 h 43 min wall clock",
                 "cost $19.90, 28 % of the round", "cost $28.60", "`sikstack-adapter route --critic` and `--judge` print"):
    assert required in design, ("drafting.md critique default / cost", required)
for _f in sorted(_shipped("*")):
    if _f.is_file() and _f.suffix in (".md", ".py", ".toml", ".json", ".yml"):
        _t = _f.read_text(encoding="utf-8")
        for gone in ("live per-page round", "that phase's review", "`xhigh` by default since v66", "Opus @ xhigh by default"):
            assert gone not in _t, (str(_f), gone)
for gone in ("your **only** licence to load it", "load it through `Skill`", "`frontend_design`",
             "A **direction round** is one whose handoff says", "A job open in the same wave"):
    assert gone not in drafter, gone
critic = " ".join((root / "agents/design-critic.md").read_text().split())
for required in ("**You get one pass**", "**The bar, line by line**", "**The state bar is on every interactive Page, lists only that page's states**",
                 "**The state-bar exemption.**", "**The direction rule follows the handoff.**",
                 "**The interaction pass is yours where it needs judgment.**", "**What it still cannot do**",
                 "w.DesignBrowser(w.design_preview_browser(None), tempfile.mkdtemp())", "--states-only",
                 "You rule once, beside the drafter's answer pass",
                 # P46-nb: the connected checks replace the cross-job look.
                 "**the connected checks, each a Part 1 must-fix under the bar.**",
                 # P47: a critic judges one page or the joined canvas; measured lines are facts.
                 "`scope: page <slug>` or `scope: cross`", "**The measured lines are facts.**",
                 "They are `high`-confidence facts either way, never argued away by taste.",
                 # P47-p5.F1: the page critic names an entity outside the fixture; the cross critic checks coverage.
                 "an entity outside the fixture included, is a Part 1 must-fix**",
                 "**fixture coverage**: every link to an entity of this round lands on that entity's own drawn item"):
    assert required in critic, required
assert 'DESIGN_PREVIEW_BLOCKING = ("non-text-contrast", "reflow", "overprint", "keyboard")' in engine_src()
for gone in ("passes 02 and 03", "Passes 02 and 03", "- repeated: N", "`repeated`:", "at pass 03",
             "`wave: <job>, <job>, …`", "**The cross-job look", "`wave choice`", "or `choice` (a cross-job conflict"):
    assert gone not in critic, gone
for gone in ('{"mcpServers"', "Prefer the **MCP** surface", "MCP first",
             "scripted Playwright-style automation", "scripted assertion suite",
             # v42 negatives: the mandatory mockup and the "not an approval" return.
             "Only PENDING #2 is an approval.", "mechanical wait", "SIGNOFF moves to the mockup gate",
             "cut the slice into four", "can no longer be waived",
             "the design in the project's own language",
             # v44: copied from the contract list, now that the instrument rule lives here.
             # P-zqhy: the Aside procedure is retired whole (surfaces, CLI, profile flag).
             "runs through Aside, not a script", "Aside", "aside repl", "aside mcp",
             "aside exec", "aside account", "--account <id>", "attachBrowserTab", "RefStaleError"):
    # (v47's absence pins for the Claude Design + DesignSync loop were retired in v48 (P27.S2): that
    # loop is the `claude-design` tool now, and its phrases are presence pins above.)
    assert gone not in design, gone
parallel = " ".join((root / "skills/parallel-phase/SKILL.md").read_text().split())
for required in ("Worktree rules", "**When — only when asked**", "retired no-op",
                 "Relay a hint to the operator; never act on it.",
                 "Never merge a parallel phase whose `worktree gate` is closed",
                 "the do-* skills relay it and run nothing",
                 # v61 (P37.S9): the contract's "(v43)" tag and its three ways of asking moved here.
                 "**Since v43 this is opt-in:", "the **`worktree` mode word**",
                 "**`worktree start <P>` run by the operator's own hand**"):
    assert required in parallel, required
for gone in ("runs in its own worktree by default", "enters its worktree at **first execution**",
             "the do-* skills do this for you"):
    assert gone not in parallel, gone
for required in ("**One exception: an explain phase (v86).**", "### An explain phase merges back by itself",
                 "**An explain phase needs no host branch (v86).**", "`exemption=phase-folder-only (<n> paths)`",
                 "`merge_ready=<P>:<branch>`", "`worktree teardown <P> --discard-ignored`",
                 "the main checkout's `.claude/settings.local.json`",
                 "(an explain phase's confirmation is the asking)"):
    assert required in parallel, required
_w = " ".join((root / "skills/do-whole-phase/reference/worktree.md").read_text(encoding="utf-8").split())
_c = (root / "skills/do-whole-phase/SKILL.md").read_text(encoding="utf-8")
assert "**One exception: an explain phase (v86).**" in _w
assert "merge_ready=" in _w and "merge_ready=" in _c and "(an explain: its confirmation asked)" in _c
_ww = " ".join((root / "skills/do-whole-phase/reference/worktree.md").read_text(encoding="utf-8").split())
for required in ("**An explain phase merges back by itself, with no stop.**", "**When the automatic merge cannot run**",
                 "**The closing report** of an explain run comes last", "`worktree teardown <P> --discard-ignored`"):
    assert required in _ww, required
review = (root / "skills/review-phase/SKILL.md").read_text()
for required in ("## The review, in order", "`walkthrough`", "`## Operator Runtime`", "`## Regression Checklist`",
                 # v36: the review opens the product with the prescribed instrument (lighter-rules:
                 # playwright-cli, against no pre-written suite, its procedure by reference).
                 "**Drive it with `playwright-cli`**",
                 "in place of a pre-written assertion suite", "with the same instrument",
                 "The procedure in full: `design-cowork`'s `reference/build.md`.",
                 # v41: the review reviews the boundary of the phase, never the whole system --
                 # phase scope is its input, and stage 4 re-runs the checklist inside it.
                 "## The boundary", "phase scope <P>",
                 # v42: a branch review records its two gate sections as tagged notes, and
                 # the mockup qualifier applies only where the operator asked for one.
                 "## Gate sections (written at merge)", "a phase in which the operator asked for one",
                 "Re-run the checklist lines inside the boundary",
                 "an operator-created QA phase, never by a review",
                 # P42.S4 (v71): a finding is a whole problem class, so one round finds every case.
                 "**A finding is a problem class, not an instance.**",
                 # The entry-level notebook: a decision is present as a gist line plus its topic, and a
                 # dangling pointer is a lost decision.
                 "A decision counts as present when its gist line is in `## Decisions` and its detail is in the linked topic",
                 "A dangling-pointer warning from `check`"):
    assert required in review, required
assert "**Stop instead of another round.**" in (root / "skills/do-whole-phase/reference/review.md").read_text(encoding="utf-8")
for gone in ("MCP surface first", "scripted Playwright-style automation",
             # P-zqhy: the Aside procedure is retired from the review.
             "Aside", "aside repl", "aside mcp", "--account <id>",
             # v41: the whole-list re-run is retired from the review (the last phrase is
             # copied from the contract list in v44).
             "not just this phase's lines", "Re-run the whole smoke list",
             "re-runs the whole cumulative"):
    assert gone not in review, gone
never = [ln for ln in review.splitlines() if "you never run on a review slice" in ln]
assert len(never) == 1 and "`gate`" in never[0] and "`defer-job`" in never[0], never
ops = (root / "templates/docs/operations.md").read_text()
assert "## Operator Runtime" in ops and "UNFILLED" in ops
assert "- Browser instrument for the agent: playwright-cli (`@playwright/cli`" in ops
assert "- Saved sign-in: <path of a `playwright-cli state-save` file the operator makes once" in ops
assert "deviceId" not in ops and "Claude in Chrome" not in ops
for gone in ("Aside", "aside repl", "aside mcp", "aside account"):
    assert gone not in ops, gone
qa = (root / "templates/docs/qa.md").read_text()
assert "## Regression Checklist" in qa
assert "- [ ] <surface>: <one observable behaviour> (P<N>)" in qa
assert "phase scope <P>" in qa and "re-runs the whole list" not in qa
assert not (root / "agents/slice-executor-mid.md").exists()
assert not (root / "agents/slice-executor-high.md").exists()
body = (root / "agents/slice-executor.md").read_text(encoding="utf-8")
fm = body.split("---\n", 2)[1]
assert "name: slice-executor\n" in fm and "model: opus\n" in fm and "effort: medium\n" in fm, fm
assert "permissionMode: bypassPermissions\n" in fm, fm
assert "tools: Read, Edit, Write, Glob, Grep, Bash, WebSearch, WebFetch, Agent\n" in fm, fm
assert len(body.encode("utf-8")) <= 3072, f"the executor card is {len(body.encode('utf-8'))} B, over its 3,072 B cap"
for gone in ("Codex", ".agents/", ".codex/", "AGENTS.md", "## Doc impact", "docs phase", "slice-executor-mid", "- `tier`",
             "cycle.md", "screen row"):
    assert gone not in body, gone
for required in ("The contract's four invariants hold", "You never commit or push",
                 "`done` | `escalate` | `needs_operator`", "`blocked`", "- `route`, `model`, `effort`:",
                 "Only the mid row escalates", "Stop the servers, containers and browsers you started",
                 "`playwright-cli`", "leave it when the slice needs to", "`## Wave`", "`section`"):
    assert required in body, required
_pb_dir = root / "skills/do-whole-phase/playbooks"
_map = body.split("## Your playbook", 1)[1].split("\n## ", 1)[0]
_named = sorted(set(re.findall(r"`([a-z][a-z-]*\.md)`", _map)) - {"plan.md", "intent.md"})
for _n in _named:
    assert (_pb_dir / _n).is_file(), f"the card names a missing playbook: {_n}"
    assert 1024 <= len((_pb_dir / _n).read_bytes()) <= 3072, (_n, len((_pb_dir / _n).read_bytes()))
assert sorted(p.name for p in _pb_dir.glob("*.md")) == _named, ("a playbook the card never names", _named)
_kinds = re.search(r"^SLICE_KINDS = \{(.*)\}$", engine_src(), re.M).group(1)
for _k in re.findall(r'"([a-z-]+)"', _kinds):
    assert re.search(r"(?<![\w-])" + re.escape(_k) + r"(?![\w-])", _map), f"kind {_k} has no playbook in the card's map"
assert (root / "skills/design-cowork/reference/mockup.md").is_file()
_pb = {p.stem: p.read_text(encoding="utf-8") for p in _pb_dir.glob("*.md")}
for _stem, _required in (
    ("feature", ("you saw fail first", "`playwright-cli`", "the plain files under `.sikstack/docs/current/`")),
    ("fix", ("**problem class**", "Every case of the class")),
    ("investigation", ("**write no product code.**", "**where the next slice reads them**", "`DECOMP2`")),
    ("review", ("`phase scope <P>`", "`subagent_type: sikstack:code-reader`", "never the plan, a result or the notebook",
                "in the same span", "**Carve-out.** Never edit source.")),
    ("verify", ("`npm install -g @playwright/cli@0.1.25`", "`playwright-cli install-browser chrome-for-testing`",
                "Only what you cannot have (a credential, a sign-in, a paid account) is `needs_operator`.", "Stop what you start")),
    ("decompose", ("**Finish line first:**", "no QA slice by default", "`slice new", "phase rounds <P>", "`spends money: no`",
                   "each co-work slice's one job with its critique level", "A fractional `--order`")),
    ("wave", ("**Write no `phase.md`.**", "**Run no engine command that writes**", "`deferred: whole-tree`")),
    ("explain", ("**The explain carve-out.**", "and dispatch no agent, `sikstack:Explore` included")),
):
    for _r in _required:
        assert _r in _pb[_stem], (_stem, _r)
_caps = {"do-whole-phase": 49000, "do-next-slice": 2500, "create-phase": 12500, "review-phase": 12000,
         "read-code": 3600, "executor-route": 1500, "commit": 2800}
_size = lambda n: sum(len(v.encode("utf-8")) for k, v in LIVE.items()
                      if k.startswith(f"${CLAUDE_PLUGIN_ROOT}/skills/{n}/") and not k.rsplit("/", 1)[1].startswith("explain-"))
for _n, _cap in _caps.items():
    assert _size(_n) <= _cap, (_n, _size(_n), _cap)
assert sum(_size(_n) for _n in _caps) <= 85000, sum(_size(_n) for _n in _caps)
_seen = {}
for _k, _v in LIVE.items():
    if _k.startswith("${CLAUDE_PLUGIN_ROOT}/skills/"):
        assert _v not in _seen, ("a skill file shipped twice", _seen.get(_v), _k)
        _seen[_v] = _k
_rv = (root / "skills/review-phase/SKILL.md").read_text(encoding="utf-8")
_ro = (root / "skills/do-whole-phase/reference/review.md").read_text(encoding="utf-8")
for _r in ("**The code reader is yours to dispatch**", "`subagent_type: sikstack:code-reader`", "Never the plan, a result, the notebook or a phase id.",
           "**Nothing the phase started is left running.**", "**One review per phase**", "Run the walkthrough"):
    assert _r in _rv, _r
assert "dispatched by the review executor itself" in _ro and "`review-phase` skill" in _ro
for _gone in ("## The code reader, before the review", "route --code"):
    assert _gone not in _ro, _gone
for _n in _caps:
    _txt = "\n".join(v for k, v in LIVE.items() if k.startswith(f"${CLAUDE_PLUGIN_ROOT}/skills/{_n}/") and "/explain-" not in k)
    for _gone in ("docs phase", "docs-phase", "docs-debt", "doc_impact", "doc_versions", "Doc impact list"):
        assert _gone not in _txt, (_n, _gone)
_s6 = ("parallel-phase", "pr", "update-workspace", "rotate-backlog", "archive-phase", "retrofit", "agenda",
       "promote-deferred", "defer-job", "deferred")
assert sum(_size(_n) for _n in _s6) <= 70000, sum(_size(_n) for _n in _s6)
for _n in _s6:
    _txt = "\n".join(v for k, v in LIVE.items() if k.startswith(f"${CLAUDE_PLUGIN_ROOT}/skills/{_n}/"))
    for _gone in ("docs phase", "docs-phase", "docs-debt", "doc_impact", "doc_versions", "docs-consolidated",
                  "contract's stop rules", "Commit Convention", "decomposition carve-out"):
        assert _gone not in _txt, (_n, _gone)
_close = LIVE["${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md"]
for _step in ("sikstack close <P>", "gh pr ready <n>", "docker rm -fv <name>", "git branch -d <b>",
              "git push origin --delete <b>", "gh pr checks <n>", "orphan **`pr-assets`** branch"):
    _where = [k for k, v in LIVE.items() if k.startswith("${CLAUDE_PLUGIN_ROOT}/skills/") and _step in v]
    assert _where == ["${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md"], (_step, _where)
for _r in ("# The close", "## Open the drafts, when the review passes", "## At `accept`: run `close`", "## Clean up before the commit",
           "**Read the CI:**", "before the gate opens**, never after the accept", "it also records the draft's head",
           "It never pushes, merges, flips a PR Ready or writes to GitHub.", "- **`reread`:**", "- **`ci`:**", "- **`land`:**",
           "- **`merge`** (a worktree phase)", "- **`commit`:**", "`gate <P> clear --words \"<their words>\"`",
           "run no pre-push local smoke and no post-landing `gh run watch`", "Never `-D`.", "Never a prune.",
           "`worktree teardown <P> --discard-ignored`", "../blob/<sha>/<folder>/<file>.png?raw=true",
           "defers its close until that base merges"):
    assert _r in _close, _r
for _gone in ("### A. Re-read", "### B. Ready and land", "topics/pr-draft", "## One check, one commit"):
    assert _gone not in _close, _gone
assert _close.index("## Open the drafts") < _close.index("## At `accept`") < _close.index("## Clean up before"), "the close's sections are out of order"
assert "`${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md`" in LIVE["${CLAUDE_PLUGIN_ROOT}/skills/parallel-phase/SKILL.md"]
assert "`${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md`" in LIVE["${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phase/reference/worktree.md"]
assert "run on request only" not in LIVE["${CLAUDE_PLUGIN_ROOT}/skills/pr/SKILL.md"] and "The `sikstack:pr-reader` runs only when the operator asks, or for a team repo with PR rules" in LIVE["${CLAUDE_PLUGIN_ROOT}/skills/pr/SKILL.md"]
assert "**The operator's run of the phase is the word for the draft's push**" in LIVE["${CLAUDE_PLUGIN_ROOT}/skills/pr/SKILL.md"]
import json as _json
_cr = (root / "agents/code-reader.md").read_text(encoding="utf-8")
assert len(_cr.encode("utf-8")) <= 3072, len(_cr.encode("utf-8"))
for _r in ("**Blind by design.**", "**Reproduce before you report.**", "**State a problem and its effect, never a fix.**",
           "**One findings file**", "Dispatched once per phase by the review's executor"):
    assert _r in _cr, _r
_prr = (root / "agents/pr-reader.md").read_text(encoding="utf-8")
assert len(_prr.encode("utf-8")) <= 2048, len(_prr.encode("utf-8"))
assert "run on request only: when the operator asks, or for a team repo with PR rules" in _prr
assert "You run on request only" in _prr and "never a fix" in _prr
for _f in sorted((root / "agents").glob("*.md")):
    _fm = _f.read_text().split("---\n", 2)[1]
    assert "mcp__claude-in-chrome" not in _fm, _f.name
_cic = []
for _base in ("skills", "agents", "contract.md", "templates"):
    _b = root / _base
    for _f in ([_b] if _b.is_file() else sorted(_b.rglob("*"))):
        if _f.is_file():
            _t = _f.read_text(encoding="utf-8", errors="replace")
            _cic += [(str(_f.relative_to(root)), ln) for ln in _t.splitlines() if re.search(r"claude.in.chrome", ln, re.I)]
            for _gone in ("deviceId", "select_browser", "list_connected_browsers", "**third** halt", "third halt"):
                assert _gone not in _t, (str(_f.relative_to(root)), _gone)
assert len(_cic) == 1 and _cic[0][0] == "contract.md" \
    and "Claude in Chrome is used only when the operator asks an agent to use their own browser" in _cic[0][1], _cic
assert "Aside" not in (root / "agents/design-drafter.md").read_text(), "sikstack:design-drafter still names Aside"
for _base in ("skills", "agents", "contract.md", "templates"):
    for _f in sorted((root / _base).rglob("*")):
        if _f.is_file():
            _t = _f.read_text(encoding="utf-8", errors="replace")
            for _gone in ("Aside", "aside repl", "aside mcp", "aside exec", "aside account"):
                assert _gone not in _t, (str(_f.relative_to(root)), _gone)
            # P-zqhy.F1: the agent's browser is keyed on its deviceId; no shipped body keeps the
            # name-keyed field or a rule matching the anonymized `name` label.
            for _gone in ("Agent's Chrome browser name", "whose `name` is", "connected under that name"):
                assert _gone not in _t, (str(_f.relative_to(root)), _gone)
_er = (root / "skills/do-whole-phase/reference/explain-review.md").read_text(encoding="utf-8")
assert "**The instrument** is `playwright-cli`, the agent's own browser" in _er
assert "`state-load`s the manifest's saved sign-in file" in _er
explore = (root / "agents/Explore.md").read_text()
explore_fm = explore.split("---\n", 2)[1]
assert "tools: Read, Grep, Glob\n" in explore_fm and "omitClaudeMd: true\n" in explore_fm
assert "Agent" not in [ln for ln in explore_fm.splitlines() if ln.startswith("tools:")][0]
for required in ("not read / possibly stale", "Never recommend, judge, decide, edit or run anything",
                 "needs judgment"):
    assert required in explore, required
claude = (root / "contract.md").read_text()
for required in (
    # The four invariants the operator signed (2026-11-20), each exactly once.
    "**Nothing is pushed, merged or paid for without the operator's word.**",
    "**A sign-off is the operator's literal words**",
    "**The operator's own work is never touched:**",
    "**Reports are truthful:**",
    # The named principles the operator steers with, and the correction ladder.
    "**Prove it works:**", "**Subtract before you add:**", "**Settle by a run:**", "**Finish line first:**",
    "**Stop what you start:**", "**Take your own recommendation:**", "**Ask, don't archive:**",
    "**The correction ladder:** fix a repeated mistake in product code first, then a type or lint, then a test or check, and only last in a rule file.",
    # The rule table, its operator-facing rows and the browser line (Claude in Chrome named once).
    "| Rule | Enforced by |", "`gate <P> clear`", "`gate clear`, `design-close`, `design-sign` refuse an empty `--words`", "`## Operator Questions`",
    "Real-browser checks run on `playwright-cli`, the agent's own headless browser.",
    "Claude in Chrome is used only when the operator asks an agent to use their own browser.",
    "install it yourself, `npm install -g @playwright/cli@0.1.25`", "it writes `.playwright-cli/` there",
    # The pointers: commands, playbooks, the code reader among the agents, the three skills named.
    "`sikstack --help`", "`sikstack-adapter --help`", "the plugin's `skills/`", "`agents/slice-executor.md`", "`code-reader.md`",
    "(`sikstack:slice-executor`, `sikstack:Explore`)", "`/sikstack:sik-mode` is the entry",
    "`/sikstack:create-phase`", "`design-cowork`", "`type(scope): summary`",
):
    assert claude.count(required) == 1, required
assert "never fan out slices" not in claude, "the contract still forbids fanning out slices"
import ast as _ast
for _f in sorted((root / "scripts").glob("*.py")):
    for _n in _ast.walk(_ast.parse(_f.read_text(encoding="utf-8"))):
        _mods = [a.name for a in _n.names] if isinstance(_n, _ast.Import) else [_n.module or ""] if isinstance(_n, _ast.ImportFrom) else []
        assert not [m for m in _mods if m.split(".")[0] in ("adapter", "wf_adapter", "adapters")], (_f.name, _mods)
assert not (root / "scripts/wf_adapter.py").exists() and not (root / "adapters/claude_code/executors.toml").exists()
assert (root / "adapters/claude_code/adapter.py").is_file() and (root / "templates/config.toml").is_file()  # the routes ship as init's config.toml
assert len((root / "contract.md").read_bytes()) <= 4096, "the contract is over its 4,096 B cap"
assert len(claude.splitlines()) <= 60, "the contract is over 60 lines"
for gone in ("## Doc impact", "docs phase", "Docs are versioned durable truth", "doc-new-version"):
    assert gone not in claude, gone
for gone in ("loop-sign", "loop-unpark", "loop-tick", "total_usd"):
    assert gone not in claude, gone
_rows = [ln for ln in claude.splitlines() if ln.startswith("| ") and not ln.startswith("| Rule")]
assert len(_rows) >= 9 and all(ln.count(" | ") == 1 and ln.split(" | ")[1].strip(" |") for ln in _rows), _rows
cloud_skip = ("In a linked checkout (`next` prints `store=cloud`), skip this commit: hi2vi's revisions"
              " are the workflow's history. Product commits are unchanged.")
for rel in ("commit/SKILL.md", "create-phase/SKILL.md", "rotate-backlog/SKILL.md",
            "do-whole-phase/reference/verdicts.md", "do-whole-phase/reference/wave.md"):
    assert cloud_skip in (root / "skills" / rel).read_text(), f"{rel}: the cloud-mode commit skip"
cloud_waits = ("In a linked checkout, a done slice whose commit waits is one `next` lists in `commits_waiting=`;"
               " run `mark-committed <slice>` after its product commit (with no product change, right after its finish).")
for rel, n in (("commit/SKILL.md", 1), ("rotate-backlog/SKILL.md", 1),
               ("do-whole-phase/reference/verdicts.md", 1), ("do-whole-phase/reference/wave.md", 1)):
    assert (root / "skills" / rel).read_text().count(cloud_waits) == n, f"{rel}: the linked waiting-commit sentence x{n}"
assert "A linked checkout (`next` prints `store=cloud`) refuses `worktree start`" in (root / "skills/parallel-phase/SKILL.md").read_text()
assert "In a linked checkout, changes made on the web arrive as inbox entries" in (root / "skills/agenda/SKILL.md").read_text()
for gone in ("Prefer the **MCP** surface", "scripted Playwright-style automation",
             "runs through Aside, not a script", "re-runs the whole cumulative",
             # P-zqhy: Aside is retired from the contract, procedure and name alike.
             "Aside", "--account <id>",
             # v42 negatives: the mandatory mockup and the "not an approval" return are
             # retired from the contract. (v42 also retired parallel mode's opt-in framing;
             # v43 deliberately restored it, so those two negatives are gone with it --
             # the positive v43 assertions above carry that invariant now.)
             "only PENDING #2 is an approval", "mechanical wait", "can no longer be waived",
             # v43 negatives: the worktree-by-default framing is retired from the contract.
             "runs in its own worktree by default", "enters its worktree at **first execution**",
             # v47 (P26.S4): the DesignSync dispatch wording is gone from the contract.
             # P36.S1: the claude-design tool, Claude Design and DesignSync are retired from it too.
             "never dispatched", "one dispatched span", "claude-design", "Claude Design", "DesignSync"):
    assert gone not in claude, gone
for gone in ("for the fullstack doc set", "appends phase notes/doc impact",
             "appends durable cross-slice notes"):
    assert gone not in claude, gone
for gone in ("design exception", "never approval", "no other pending gate"):
    assert gone not in claude, gone
for gone in ("Codex", "AGENTS.md", ".agents/", ".codex/"):
    assert gone not in claude, gone
compact = claude.split("## Compact Instructions", 1)[1]
assert "resume card" in compact and "never re-dispatch a running executor" in compact
assert "re-read" not in compact, "Compact Instructions carry a re-read instruction"
# The PR rule's wiring phrases in the contract and the shipped skills, and the negatives they replaced (old Test 19 S9).
ENGINE = "".join(v for k, v in sorted(LIVE.items()) if k.startswith("scripts/"))  # every module of the engine
sk = lambda n: "\n".join(v for k, v in sorted(LIVE.items()) if k.startswith(f"${CLAUDE_PLUGIN_ROOT}/skills/{n}/"))
flat = lambda s: " ".join(s.split())
both = lambda ref: [LIVE[f"${CLAUDE_PLUGIN_ROOT}/skills/do-whole-phase/reference/{ref}"]]  # lighter-rules: do-next-slice ships no copy
push_stop = ["`push` stop", "push stop", "On the operator's `push`", "on the operator's `push`", "say `push`", "pr_push=waiting", "PR_PUSH_WAITING"]
checks = [
    ([(root / "contract.md").read_text()], ["**Nothing is pushed, merged or paid for without the operator's word.**", "| A branch switch never carries the operator's edits | `pr branch` refuses"],
     ["| A product phase passes with its draft PR open |", "Create no branch unless asked", "Never push unasked", "push only on the operator's word", "Ready and merge are the operator's"] + push_stop),
    ([sk("review-phase")], ["## The PR step — one body per recorded branch", "**Writing the body is a review lens.**", "**Return `pr_bodies`**"], push_stop),
    (both("review.md"), ["open the drafts by the `pr` skill's *Open the drafts*", "with no stop and no word", "read each PR's CI before the gate",
                         "`sikstack-adapter route --reader`", "--stop-kind operator-action --on-words \"<what fixing it resumes>\"",
                         "a refused draft is never retried as a plain PR", "A pass with a recorded branch still unopened prints `advice: pr_draft=due`"],
     push_stop + ["push opens the draft PR(s); the pass is recorded after"]),
    (both("verdicts.md"), ["**The only pushes are the draft opening when the review passes**", "**the close's solo landing, and a fix round's or a stack merge's `git push` to an open PR's branch**"],
     ["do not branch unless the operator asks", "Do not branch unless the operator asks", "**The only push is the draft opening", "Never force-push, request reviewers, merge a team repo's PR or flip one Ready"] + push_stop),
    (both("review.md"), ["run `close <P>` by `${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md`", "records the pass **without re-dispatching the review**",
                         "**After the phase is done**", "always `phase reopen <P> --note \"team-reported: <what>\"`"], ["Ready and merge stay the operator's"]),
    ([sk("review-phase")], ["**A reopened phase's re-review**", "or `operator-reported: …`, from `phase reopen`"], []),
    ([sk("rotate-backlog")], ["**First, sync the open PRs (both paths).**"], []),
    ([LIVE["${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md"]], ["**Pass recorded or not.**", "always goes through `phase reopen`", "never `review`, which the engine refuses",
                                                   "--note \"operator-reported: CI red: <checks>\"", "**A change asked for after Ready**"], []),
    ([LIVE["${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/reopen.md"]], ["**One rule.**", "`git -C <host> switch <default>`", "No worktree is cut or claimed", "`git worktree add <sibling> <branch>`",
                                                    "**At root, commit the reopen with the fix round's first commit**"], ["## Team-reported changes after the phase is done"]),
    ([ENGINE], ["a change request (the team's or the operator's) reopens it on the PR branch", "--note is empty; say whose change request it is and what it asks"], ["a team's change request reopens it in its own worktree", "say what the team asked for"]),
    ([ENGINE], ["(a change request after the phase was done, the team's or the operator's)", 'help="whose change request it is and what it asks: \\"team-reported: <what>\\" or \\"operator-reported: <what>\\" (recorded as the review note'],
     ["a team asked for changes after the phase was done", "what the team asked for:", "a team's new change request becomes a new phase", "# A team asks for changes after the phase is done"]),
    ([(root / "skills/do-whole-phase/playbooks/review.md").read_text()], ["(its review note reads `team-reported: …` or `operator-reported: …`): the request is the claims to verify"],
     ["(its review note reads `team-reported: …`): the team's review comments"]),
    ([sk("pr")], ["**Changes after the phase is done**: `reference/reopen.md`"], ["**Team changes after the phase is done**"]),
    (both("review.md"), [], ["or a team's review after a reopen)"]),
    ([sk("archive-phase")], ["**A phase with an open PR:** `phase rotate` leaves it active"], ["is held too"]),
    ([sk("create-phase")], ["**One question rides on that confirmation, never a stop of its own:**"], []),
    ([flat(sk("parallel-phase"))], ["### A reopened phase — a change request on its open PR", "`--note \"operator-reported: <what>\"`", "Then `pr sync <P>` there (the default branch's record is stale)"], ["### A reopened phase — a team's changes on its open PR"]),
    (both("decomposition.md"), ["--base <that branch>"], []),
    (both("decomposition.md"), ["**Record the phase's PR branches** (PR rule v1)", "**Size never splits a phase:**"], []),
    ([sk("create-phase")], ["`Branches:` line", "Never split a phase for size"], push_stop),
    ([(root / "skills/do-whole-phase/playbooks/review.md").read_text()], ["`pr_bodies`", "Never run `review`, `gate` or `defer-job`, and never push."], push_stop),
    ([flat(sk("parallel-phase"))], ["By the close alone: `close <P>`'s `merge` and `teardown` steps (`${CLAUDE_PLUGIN_ROOT}/skills/pr/reference/close.md`)."], ["1. **Push the branch.**", "**Open the PR.**"] + push_stop),
    ([sk("pr")], ["## Open the drafts, when the review passes", "opened as drafts when the review passes, closed on the operator's accept.\"", "`git push -u origin <b>`, never `--force`."], push_stop),
    ([sk("commit")], ["A phase's pushes are the `pr` skill's, never this skill's: the draft opening when its review passes, the close's solo landing, and a fix round's or a stack merge's push to an open PR's branch."], push_stop + ["A phase's one push is"]),
    ([ENGINE], ["pr_draft=due -- when the review would pass", "the draft opens when the review passes (pr skill: Open the drafts)"],
     ["pr_push_parked", "_pr_push_stop_why", "PR push stop", "the operator's push opens"] + push_stop),
]
for texts, required, gone in checks:
    for t in texts:
        for r in required:
            assert r in t, r
        for g in gone:
            assert g not in t, g
