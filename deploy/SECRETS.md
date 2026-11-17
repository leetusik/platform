# Secrets & DNS provisioning runbook — hi2vi.com

Operator runbook for the secrets + DNS that `https://hi2vi.com` needs.
This is the "**produce the credentials and register them**" half;
[`README.md`](README.md) is the "**place them and bring the box up**" half.

> **No secret values ever live in this repo.** For the bearer token (§1) and the git
> push key (§2), the stronger rule also holds: **no value ever transits a laptop, a
> chat, or a terminal transcript** — both are **generated on the box**, straight into
> their final location, and only *public* halves and *names/paths* ever leave it.
> **One deliberate exception — the GHA runner key (§2b)**, which *cannot* be box-born
> because its *private* half must reach a GitHub Actions secret. It is minted in a
> `umask 077` tempdir on the operator's trusted machine, piped **once** into
> `gh secret set` (which encrypts it client-side, in flight), its `.pub` pushed to the
> box, and the tempdir then shredded — a minimal, controlled transit, never a paste or
> a transcript. Placement paths below are the exact ones `compose.prod.yml` mounts —
> don't change them without editing that file.

Work top to bottom; tick the **handoff checklist** (§5) when done.

---

## 1. `KB_API_TOKEN` — the bearer token (writes + hosted reads)

The box runs `KB_REQUIRE_READ_AUTH=true`, so this one token guards **every**
`/api/*` call (writes and reads/search alike); `GET /healthz` stays open.

**It is generated on the box, directly into `/opt/knowledge/.env`** — see
[`README.md`](README.md) §1c, which writes the file with an *unquoted* heredoc so
`$(openssl rand -hex 32)` expands in place. The value is never echoed, never
pasted, never copied anywhere. Don't generate it here and carry it over.

Retrieve it only when something actually needs it:

```bash
ssh oracle-cloud "sudo grep '^KB_API_TOKEN=' /opt/knowledge/.env"
```

- **Cross-repo:** that exact value is what the hi2vi content agent uses as its
  `KNOWLEDGE_API_TOKEN` (per the frozen consumer contract in the published
  `api.md`). It is the single shared secret between the two repos — hand it over a
  secure channel, and rotate both sides together (edit the box `.env`, then
  `docker compose -f compose.prod.yml up -d` to restart the api).

---

## 2. SSH deploy key — the publish-on-write push credential

The box's api container commits **and pushes** each write to `origin/main`
(`KB_GIT_PUSH=true`), so it needs a write-capable git credential. We use a
**repo-scoped SSH deploy key**: smaller blast radius than a personal PAT, and no
expiry to babysit.

**2a. Generate the keypair ON THE BOX**, in its final location. The private half is
born there and never leaves:

```bash
# On the box (ssh oracle-cloud). No passphrase — the container runs unattended.
sudo mkdir -p /opt/knowledge-secrets
sudo ssh-keygen -t ed25519 -N '' -C 'knowledge-api@oci' \
  -f /opt/knowledge-secrets/knowledge_deploy_key
sudo chmod 600 /opt/knowledge-secrets/knowledge_deploy_key
#  -> /opt/knowledge-secrets/knowledge_deploy_key      PRIVATE — stays on the box, forever
#  -> /opt/knowledge-secrets/knowledge_deploy_key.pub  PUBLIC  — safe to copy anywhere
```

That path is exactly what `compose.prod.yml` bind-mounts read-only into the
container as `/run/secrets/knowledge_deploy_key`. There is no "copy the key to the
box" step and no local copy to delete — there was never a local copy.

**2b. Register the PUBLIC half on GitHub, with write access:**

```bash
# From your Mac, with `gh` authenticated. Only the .pub half moves.
ssh oracle-cloud 'sudo cat /opt/knowledge-secrets/knowledge_deploy_key.pub' > /tmp/knowledge_deploy_key.pub
gh repo deploy-key add /tmp/knowledge_deploy_key.pub \
  -R leetusik/platform --title 'knowledge-api-box' --allow-write
rm /tmp/knowledge_deploy_key.pub
gh repo deploy-key list -R leetusik/platform     # confirm it is listed
```

Or the web UI: `https://github.com/leetusik/platform` → **Settings** → **Deploy
keys** → **Add deploy key**, paste the `.pub` contents, **check "Allow write
access"** (the push fails without it).

**2c. Box clone origin must be SSH.** The container pushes to `origin`, so the box
clone's remote must be `git@github.com:leetusik/platform.git`, not the `https://`
form. `README.md` §1a clones over HTTPS (the repo is public — reading needs no
credential) and then `git remote set-url origin git@github.com:…`, so the *push*
path is the deploy key.

Host-key pinning (`ssh-keyscan` → `/opt/knowledge-secrets/known_hosts`) is
`README.md` §1b — do it there.

---

## 2b. GHA runner → `opc@box` SSH key — the production-deploy credential (P9)

The automated **Production Deploy** GitHub Action (`.github/workflows/deploy-production.yml`) SSHes
from the runner into `opc@140.245.64.173` to run the on-box deploy. Its driver,
[`github-actions-production-deploy.sh`](github-actions-production-deploy.sh), reads **three repo
secrets** on `leetusik/platform`:

- **`ORACLE_SSH_PRIVATE_KEY`** — **required**. The full OpenSSH **private** key (the entire
  `BEGIN…END` block). Written to a `umask 077` tempfile and used with `-i … -o IdentitiesOnly=yes`.
- **`ORACLE_SSH_KNOWN_HOSTS`** — **required**. The box's real host-key line(s), keyed on
  `140.245.64.173` (port 22 → bare-host form). Consumed under
  `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<pinned>`, so a wrong or empty value makes
  **every** SSH fail closed.
- **`ORACLE_SSH_PASSPHRASE`** — **optional**. Used only if non-empty (then the driver spins up
  `ssh-agent` + askpass). A passphrase-less key leaves this **unset**.

> **This is NOT the §2 key.** They are two different credentials pointing in opposite directions;
> conflating them is the classic footgun here (and P8 already saw a key leak). Side by side:
>
> | | §2 container deploy key | §2b runner key (this section) |
> |---|---|---|
> | direction | box container → GitHub (git push) | GHA runner → `opc@box` (SSH login) |
> | stored as | GitHub **deploy key** + box file `/opt/knowledge-secrets/knowledge_deploy_key` | GitHub **Actions secrets** (`ORACLE_SSH_*`) + a line in `opc`'s `authorized_keys` |
> | born | on the box, never leaves | in a locked tempdir on the operator's machine (must reach a GH secret) |
> | comment tag | `knowledge-api@oci` | `knowledge-gha-runner@box` |
>
> **P9 provisions §2b only.** It never mints, moves, reads, or re-registers the §2 key — the box's
> root-owned `/opt/knowledge-secrets/knowledge_deploy_key` (and its GitHub deploy-key registration)
> is left completely untouched.

**2b-i. Mint a dedicated, passphrase-less key** (least-privilege; a dedicated key can be
rotated/revoked without disturbing hi2vi's deploy). Do this **on the operator's machine** — the one
that already has `gh` authenticated to `leetusik/platform` **and** SSH access to the box:

```bash
umask 077
tmp="$(mktemp -d)"                       # 0700 dir; holds the PRIVATE half only transiently
ssh-keygen -t ed25519 -N '' -C 'knowledge-gha-runner@box' -f "$tmp/knowledge_gha_runner"
#  -> $tmp/knowledge_gha_runner       PRIVATE — becomes the ORACLE_SSH_PRIVATE_KEY secret, then shredded
#  -> $tmp/knowledge_gha_runner.pub   PUBLIC  — appended to opc's authorized_keys (2b-iii)
```

`-N ''` mints it **passphrase-less** — the recommended default for an unattended runner, since the
private half is already an access-controlled GitHub secret. To use a passphrase instead, replace
`-N ''` with `-N '<passphrase>'` and also set `ORACLE_SSH_PASSPHRASE` in 2b-ii.

**2b-ii. Set the three secrets on `leetusik/platform`**, piping the private half **straight in** — it
is never displayed, pasted, or written outside the tempdir:

```bash
gh secret set ORACLE_SSH_PRIVATE_KEY -R leetusik/platform < "$tmp/knowledge_gha_runner"

# Pin the box's host key. VERIFY it out-of-band before trusting it (2b-iv).
ssh-keyscan -p 22 140.245.64.173 | tee "$tmp/known_hosts"
gh secret set ORACLE_SSH_KNOWN_HOSTS -R leetusik/platform < "$tmp/known_hosts"

# ORACLE_SSH_PASSPHRASE — set ONLY if you minted the key WITH a passphrase; otherwise leave it
# unset (the driver treats empty/absent as passphrase-less):
# gh secret set ORACLE_SSH_PASSPHRASE -R leetusik/platform     # then type the passphrase at the prompt
```

Or the web UI: `leetusik/platform` → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**. The driver `require_env`s the first two, so **both must exist** or the deploy dies
before it connects; the passphrase secret may be absent.

**2b-iii. Authorize the PUBLIC half on the box — append, never overwrite.** hi2vi's runner key lives on
this same `opc` account and must survive:

```bash
ssh-copy-id -i "$tmp/knowledge_gha_runner.pub" opc@140.245.64.173
#   ssh-copy-id APPENDS and fixes perms; it never clobbers existing keys. Equivalent manual form,
#   run ON the box, is strictly append (note the >>):
#     cat >> ~/.ssh/authorized_keys      # paste the single knowledge_gha_runner.pub line, then Ctrl-D
#     chmod 600 ~/.ssh/authorized_keys
```

> A **dedicated line** is the whole point of "dedicated": this key can later be rotated or revoked by
> deleting **just its line** from `~opc/.ssh/authorized_keys` and rotating the `ORACLE_SSH_*` secrets —
> hi2vi's deploy on the same account is never touched (blast-radius isolation). It is isolation, **not**
> command restriction: the driver `scp`s a script and then runs it, so an `authorized_keys`
> forced-command lock isn't applicable here.

**2b-iv. Verify the pinned host key out-of-band.** `ssh-keyscan` trusts whatever answers at scan time,
so confirm its fingerprint against the box's real host key from an **already-trusted** session before
relying on it — otherwise a scan-time MITM could pin an attacker's key:

```bash
ssh-keygen -lf "$tmp/known_hosts"                                          # what you just scanned
ssh opc@140.245.64.173 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'  # ground truth on the box
# The fingerprints MUST match. This is exactly what makes StrictHostKeyChecking=yes safe in the driver.
```

**2b-v. Shred the tempdir.** The private half exists only transiently — destroy it as soon as the
secret is set and the `.pub` is authorized:

```bash
shred -u "$tmp"/knowledge_gha_runner* 2>/dev/null || true   # (rm -P on macOS)
rm -rf "$tmp"
```

---

## 3. Cloudflare DNS + origin TLS — **both already done, nothing to provision**

**3a. DNS — done.** The platform serves the apex `hi2vi.com`; the proxied
`knowledge` and `vocky` records on the `hi2vi.com` zone stay, because those two hosts
now answer with redirects to the apex (`README.md` §3). All three resolve to the same
Cloudflare proxy IPs. Confirm any time:

```bash
dig +short hi2vi.com knowledge.hi2vi.com vocky.hi2vi.com   # Cloudflare proxy IPs, all the same
```

**3b. Origin cert — already covered.** The edge's Cloudflare Origin CA cert at
`/home/opc/edge/certs/hi2vi.crt` carries SANs **`DNS:*.hi2vi.com, DNS:hi2vi.com`**
(valid to 2041): the apex SAN covers `hi2vi.com` and the wildcard covers
`knowledge.hi2vi.com` and `vocky.hi2vi.com`. All three vhosts (`deploy/hi2vi.conf`,
`deploy/knowledge.conf`, `deploy/vocky.conf`) point straight at it. **No cert to
issue, no per-host variant, no edge cert step.** Verified with:

```bash
ssh oracle-cloud "openssl x509 -in /home/opc/edge/certs/hi2vi.crt -noout -text \
  | grep -A1 'Subject Alternative Name'"
# confirmed: DNS:*.hi2vi.com, DNS:hi2vi.com   -> the apex and both redirect hosts are covered
```

> If that cert is ever replaced by a per-host (non-wildcard) one, this assumption
> breaks for the two redirect hosts: issue Origin CA certs for them, drop them under
> `/home/opc/edge/certs/`, and repoint the `ssl_certificate*` lines in
> `deploy/knowledge.conf` and `deploy/vocky.conf` (and add the new basenames to the
> edge repo's `validate.sh` and `stage.sh`). (Cloudflare's public-facing TLS is
> handled by the proxied records either way; this is only the **origin** cert nginx
> serves to Cloudflare.)

---

## 4. Optional `GOOGLE_API_KEY` — Gemini for hybrid search

Recommended at launch. hi2vi's read/search use case (topic dedup, research
grounding) is exactly what hybrid semantic search improves, and it is **one env var
with graceful degradation**: absent or quota-limited → search silently falls back to
BM25-only (`mode:"bm25"`), **zero code change** either way.

- Obtain a key from Google AI Studio (`https://aistudio.google.com/apikey`).
- Placement: `/opt/knowledge/.env` as `GOOGLE_API_KEY=<value>` on the box
  (`README.md` §1c leaves the line empty for you to fill in-place on the box, e.g.
  with `sudo vi`). Leaving it empty is a supported launch choice — add the key later
  and restart the api with no other change.

### 4b. Optional `KB_SMTP_*` — the api's outgoing mail

The api sends three mails, all best-effort and all from one sender:

- **Feedback's owner alert**: when a Feedback event is captured, the project owner gets a
  mail after the response.
- **The waitlist mail**: with the waitlist on (§4c), a new sign-up gets "You're on the
  hi2vi waitlist" after the response.
- **The approval mail**: approving a waitlisted account (§4c) sends it "Your hi2vi account
  is open", with a sign-in link built from `KB_PUBLIC_BASE_URL` (`https://hi2vi.com`,
  already set in `compose.prod.yml`) + `/login`.

All three read the same five names from the box's `.env` (through the api's `env_file:`):

| Name | What |
|---|---|
| `KB_SMTP_HOST` | the SMTP server |
| `KB_SMTP_PORT` | its port (default 587, STARTTLS; 465 means implicit TLS) |
| `KB_SMTP_USER` | the login (unset: no AUTH) |
| `KB_SMTP_PASSWORD` | **the secret**: the login's password |
| `KB_SMTP_FROM` | the sender address (unset: the login) |

- Optional: with no host, or no sender (neither `KB_SMTP_FROM` nor `KB_SMTP_USER`), no
  mail goes out and everything else works unchanged (capture, sign-up, approval).
- At hi2vi.com the sender is the **hi@hi2vi.com** mailbox: `KB_SMTP_FROM=hi@hi2vi.com`,
  and the login is that mailbox (its provider refuses a sender that does not match the
  login). Because the three mails share the sender, setting hi@hi2vi.com also moves
  Feedback's owner alert to hi@hi2vi.com, away from any account the box used before.
- Placement: the five lines go into `/opt/knowledge/.env` on the box, the password never
  shown on a screen, pasted into a chat or committed. Set them over ssh from the
  operator's machine with a script that reads each value by name from the operator's
  local git-ignored `.env` and writes it into the box's file without printing it, or with
  an editor on the box (`sudo vi`). Verify by name only
  (`grep -c '^KB_SMTP_PASSWORD=' /opt/knowledge/.env` prints `1`, never the value). Then
  recreate the api (`docker compose -f compose.prod.yml up -d --force-recreate --no-deps
  api`, or the next Production Deploy, which force-recreates it).

### 4c. Optional `KB_SIGNUP_WAITLIST` — hold new sign-ups for approval

Not a secret, but it lives in the box's `.env` next to the mail settings
(`KB_SIGNUP_WAITLIST=on`).

- **Off by default.** With the line absent (or anything but `1`, `true`, `yes`, `on`), a
  sign-up gets an account and a session at once, so a self-hosted install behaves as it
  always did. **On at hi2vi.com.**
- With it on, a new sign-up is created on the waitlist: it gets no session, sees the
  waitlist screen and, with `KB_SMTP_*` set, the waitlist mail. Signing in with the right
  password shows the same waitlist screen until the account is approved. Accounts that
  existed before the switch are all approved.
- **The operator's two commands**, on the box in `/opt/knowledge`:

  ```bash
  docker compose -f compose.prod.yml exec api python -m server.waitlist list
  #   the waitlisted accounts, oldest first (email and when they signed up)
  docker compose -f compose.prod.yml exec api python -m server.waitlist approve <email>
  #   approves one account and sends it the approval mail, once
  ```

  `approve` exits **0** when the account is approved (just now, or already: then it says
  nothing changed and sends no mail), **1** for an unknown email (nothing changes) or a
  missing `DATABASE_URL`, and **2** when the approval landed but its mail failed: the
  account stays approved, so tell the person yourself. With `KB_SMTP_*` unset it
  approves, exits 0 and says no mail was sent.
- The account status is a database column added by migration `0010`; it rides the
  Production Deploy's `alembic upgrade head` like every migration, with nothing to run by
  hand. Turning the switch on or off later needs only the `.env` line and an api
  recreate (as in §4b).

### 4d. Optional `HI2VI_FEEDBACK_CAPTURE_KEY` — hi2vi's own Send feedback control

**What it is.** The key the web container posts hi2vi's own feedback with: the "Send
feedback" link in the landing's footer and the button on org home. It is a Feedback
key (`vk_…`) **bound to one project**, the `hi2vi` project in the operator's org, with
the **`capture` scope only**: it can add a feedback item to that project and nothing
else (no reads, no other project, no documents). Each message it captures mails the
org's owner through §4b's sender.

- **Who mints it:** the operator, signed in to hi2vi.com in their own org, after the
  phase that ships the control is accepted (`README.md` §7 has the steps). Never minted
  on a laptop's local stack and copied up: a local key does not exist in production.
- **Optional.** Unset or blank: the control is not shown on either page, which is also
  how a self-hosted install runs. Nothing else depends on it.
- **Server-only.** Not `NEXT_PUBLIC_`: only the Next.js server reads it, the browser
  never sees it. `compose.prod.yml` passes it to `knowledge-web` from the box's `.env`
  (`${HI2VI_FEEDBACK_CAPTURE_KEY:-}`). The api's `env_file: .env` loads the same file,
  so the value also sits in `knowledge-api`'s environment, as `SESSION_SECRET` does;
  the api never reads it (it stores only the key's hash).
- **Placement:** one line, `HI2VI_FEEDBACK_CAPTURE_KEY=<key>`, in `/opt/knowledge/.env`,
  set the way §4b sets its password: never shown on a screen, pasted into a chat or
  committed. The key is shown once, when it is minted. Verify by name only
  (`grep -c '^HI2VI_FEEDBACK_CAPTURE_KEY=' /opt/knowledge/.env` prints `1`).
- **Rotate or revoke:** mint a new key for the project, replace the line, recreate the
  web container, then revoke the old key on the project's keys page. Revoking without a
  replacement makes every send fail (the control then says it could not send).
- **The six numbers** (not secrets, optional, the same `.env`): `HI2VI_FEEDBACK_MAX_CHARS`
  (2000), `HI2VI_FEEDBACK_IP_LIMIT` (5) per `HI2VI_FEEDBACK_IP_WINDOW_S` (600),
  `HI2VI_FEEDBACK_ACCOUNT_LIMIT` (10) per `HI2VI_FEEDBACK_ACCOUNT_WINDOW_S` (600) and
  `HI2VI_FEEDBACK_DAILY_CEILING` (200). Unset, blank or not a positive integer: the
  default in brackets.

---

## 5. Handoff checklist — all boxes ticked = ready for bring-up

- [ ] **SSH deploy key** generated **on the box** at
      `/opt/knowledge-secrets/knowledge_deploy_key` (ed25519, no passphrase, chmod
      600); **public** half registered on `leetusik/platform` **with write access**.
- [ ] **GHA runner key** (§2b) minted (dedicated, ed25519), `.pub` appended to
      `~opc/.ssh/authorized_keys` (hi2vi's key left intact), and the three
      `ORACLE_SSH_*` secrets set on `leetusik/platform` — gates the automated
      **Production Deploy** action (P9), not the initial hand bring-up.
- [ ] **`KB_API_TOKEN`** — will be generated in place at `README.md` §1c (nothing to
      do in advance); afterwards, hand the value to the hi2vi side as
      `KNOWLEDGE_API_TOKEN`.
- [ ] **Box clone origin** set to the SSH form `git@github.com:leetusik/platform.git`
      (`README.md` §1a).
- [ ] **Cloudflare apex, `knowledge` and `vocky` records** — ✅ already live, proxied.
- [ ] **Origin cert coverage** — ✅ already covered by the `*.hi2vi.com` wildcard
      (`hi2vi.crt`); nothing to issue.
- [ ] **`GOOGLE_API_KEY`** obtained (recommended) — or a deliberate BM25-only launch.
- [ ] **`KB_SMTP_*`** (§4b, optional) set in `/opt/knowledge/.env` for the
      hi@hi2vi.com mailbox (`KB_SMTP_FROM=hi@hi2vi.com`), values never printed — or a
      deliberate launch with no outgoing mail (no Feedback alert, no waitlist mails).
- [ ] **`KB_SIGNUP_WAITLIST=on`** (§4c) in `/opt/knowledge/.env` for hi2vi.com — or a
      deliberate open sign-up.
- [ ] **`HI2VI_FEEDBACK_CAPTURE_KEY`** (§4d, optional) — minted by the operator on
      hi2vi.com for the `hi2vi` project (Capture only) and set in `/opt/knowledge/.env`
      after the control ships (`README.md` §7), value never printed — or left unset, and
      the control stays hidden.
- [ ] **Api recreated** after any `.env` change (`up -d --force-recreate --no-deps api`,
      or the next Production Deploy), and both names checked by name only
      (`grep -c '^KB_SIGNUP_WAITLIST=on$' /opt/knowledge/.env` prints `1`).
- [ ] **Waitlist commands** known: `docker compose -f compose.prod.yml exec api python -m
      server.waitlist list` and `… approve <email>` (exit 0 approved, 1 unknown, 2 approved
      but the mail failed) (§4c).

Next: `README.md` §1 (clone, place `known_hosts`, write `.env`) → §2 (bring-up, incl.
the `ssh`-in-image assertion) → §3 (land the vhosts through the edge repo) → §5 (validation).
