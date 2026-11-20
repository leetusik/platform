---
name: hi2vi-verify
description: "Run hi2vi locally and prove a feature works in a real (headless) browser with playwright-cli. Use when asked to verify, check or try a hi2vi feature (sign-in, overview, library, feedback, ...), or to prove a change to platform/ in a browser, take screenshots of it, or walk a page as a user."
---

# Verify hi2vi in a browser

One script, `run.sh` (beside this file), runs the whole product on loopback without touching the checkout; one file per feature in `features/` says how to reach it, drive it and prove it. A playbook: leave it with a stated reason when the task needs something else.

1. **Doctor** — `bash .claude/skills/hi2vi-verify/run.sh doctor` (from `platform/`; any cwd works). Checks Docker, uv, pnpm, node, `web/node_modules`, `.venv`, `playwright-cli` (installs `@playwright/cli@0.1.25` when missing) and ports 3030/8766. A port already taken (often the operator's own dev server) is named and left alone; `up` takes the next free one.
2. **Launch** — `run.sh up [evidence-dir]`: a `postgres:17` container `hi2vi-verify-pg`, migrations, the API (scratch `KB_ROOT`, `KB_GIT_COMMIT=false`), a local test account, `next dev`. Its env is passed to the processes; no `web/.env.local` is written. Then `run.sh signin` (a saved sign-in is reused; the BFF allows about 5 logins per 15 minutes). `run.sh status` prints the web URL, the evidence folder and what runs.
3. **Drive** — `playwright-cli -s=hi2vi-verify <command>`, called plainly (no `cd … &&`, no env prefix): `goto`, `snapshot`, `find "<text>"`, `click`/`fill` with a ref or a selector such as `'role=button[name="Send"]'`, `screenshot --filename=<evidence>/<name>.png`. `run.sh expect "<text>"...` waits until the page shows each text and fails otherwise. Never type the password yourself, and never `kill-all`/`close-all` (other sessions may be running).
4. **Evidence** — everything lands in the evidence folder (default `${TMPDIR}hi2vi-verify/runs/<time>/`): `run.log`, `api.log`, `web.log`, screenshots, `auth-state.json`, and the CLI's snapshots in `cli-output/`. Report the screenshot paths and the end state you saw.
5. **Cleanup** — `run.sh down`: closes the session, stops both servers, removes the container and the scratch data, checks the evidence for the password, keeps the evidence. Always run it, also after a failure. After it: no `hi2vi-verify-pg`, nothing of ours on the ports, `git status` unchanged.

## Features

`features/<name>.md`: **Reach it**, **Drive it** (a ```` ```bash drive ```` block of the kept steps), **Proof**. Run one whole with `run.sh feature <name>` (log and screenshot in the evidence folder), or follow its steps by hand. Pick the file named after the surface the change touches; read only that one. Today: `sign-in`, `overview`, `library`, `feedback`.

**Add one** when a probe worked: copy the `playwright-cli` lines you ran (the CLI prints each as Playwright code), with `$WEB`, `$EV` and `"$RUN"` for the URL, the evidence folder and this script, end with an `expect` and a `screenshot`, and run `run.sh feature <name>` once before keeping it.
