# sikstack

sikstack is a phase-and-slice workflow for Claude Code. You ask for a change; the agent writes it up as a
**phase**, cuts it into **slices**, runs each slice on its own executor, reviews the result, and stops for you to
walk it before it lands. The plan, the verdicts and the decisions stay on your machine, in your repo's hidden
`.sikstack/` folder, kept out of the repo's history.

It installs as a Claude Code plugin and needs no account: one setup per machine, then work.

## Install

In Claude Code:

    /plugin marketplace add leetusik/sikstack
    /plugin install sikstack@sikstack
    /sikstack:setup

`/sikstack:setup` runs once per machine. Then start working, in any git repository:

    /sikstack:sik-mode

`sik-mode` reads where the repo stands and offers the next step: making the `.sikstack/` folder, starting a phase,
running the one in flight, or showing what waits on you.

To clone only the plugins rather than the whole repository, add the marketplace from a shell with a sparse
checkout:

    claude plugin marketplace add leetusik/sikstack --sparse .claude-plugin plugins

**Needs** Claude Code, `git`, and `python3` 3.8 or later. Nothing else: no server, no key, no Docker.

## No account needed

Setup asks for an email and registers it, with a random install id, at sikstack.com. That is all the server keeps
before you sign in. Your phases and their records stay on your machine, and sikstack works fully without signing
in. If sikstack.com cannot be reached, setup still finishes and registers on a later run.

**Sign in later to see your work on the web.** `/sikstack:sign-in` prints a short code and opens a page on
sikstack.com; you confirm the same code there, signed in to your account, and the install is connected. The repo's
earlier work then uploads, and you see its phases on the web. An email alone never connects an install: only a
code you confirm does.

## On the web, for signed-in users

<https://sikstack.com> holds the web services, for signed-in users (new accounts start on a waitlist):

- **Workspace**: a connected repo's phases, slices and verdicts, its agenda and its docs.
- **Library**: books and documents your agents write for you to read, grounded in the code; read, listen,
  review with a quiz, search in English and Korean, and publish a project's documents in your org's public library.
- **Feedback**: what your users said, captured from your product over REST or MCP with a capture-only key.

Agents can also write to sikstack directly: the `knowledge` CLI (`curl -fsSL https://sikstack.com/install.sh |
bash`, see [`cli/README.md`](cli/README.md)), or plain REST with `KB_API_BASE_URL=https://sikstack.com` and an
org key. The Feedback capture skill for agents is published at
[`/feedback/SKILL.md`](https://sikstack.com/feedback/SKILL.md), and the MCP endpoints are described in
[`mcp-server/CONTRACT.md`](mcp-server/CONTRACT.md).

## Running it yourself

There is no packaged self-host install yet. What this repository supports today:

- `docker compose up -d` (`compose.yml`) starts the document API, its Postgres and the docs viewer locally;
  `docker compose exec api alembic upgrade head` creates the accounts tables.
- `pnpm --dir web dev` serves the web app (`web/`, Next.js), against that API.
- Production runs as one box behind an nginx edge; its runbook is [`deploy/README.md`](deploy/README.md).
- The plugin talks to the server `SIKSTACK_SERVER` names, `https://sikstack.com` when it is unset.

## What is in this repository

- `plugins/sikstack/`: the sikstack plugin, the workflow engine and its skills, agents and hooks
  ([`CHANGELOG.md`](plugins/sikstack/CHANGELOG.md)). Its history before the move is
  `leetusik/bootstrap_agentic_workspace.sh`'s.
- `plugins/explain/`: a second plugin, `explain`, that writes a chapter from the code and your phases' records
  into your Library. It is on hold and not offered yet.
- `server/`, `web/`, `cli/`, `mcp-server/`, `tools/listen-runner/`: the services behind sikstack.com.
- `.claude-plugin/marketplace.json`: the marketplace that lists both plugins.

## Credits

sikstack is my personal take on [pstack](https://github.com/cursor/plugins/tree/main/pstack), Lauren Tan's
Claude Code and Cursor plugin: her principles (install and go, no account, a setup once, an entry point that
routes the work to playbooks), reshaped around this phase-and-slice workflow. It took pstack's ideas, not its code.
sikstack is not a fork of pstack, and it is not affiliated with or endorsed by Cursor or Lauren Tan. See
[`NOTICE`](NOTICE).

## License

MIT, see [`LICENSE`](LICENSE).
