# Sign-in

**Reach it:** `/login` (any app page redirects there when signed out). The local test account is made by `run.sh up` (`scripts/dev_feedback_key.py`, usually `you@example.com`); its password lives only in the state folder's `web.env`.

**Drive it:** `run.sh signin` does it: fills Email, fills Password with `--submit` (output to `/dev/null`: the CLI echoes filled text and a snapshot shows the field's value), waits for `/dashboard`, then `state-save`s `auth-state.json` into the evidence folder. Run again, it `state-load`s that file instead of logging in (the web BFF allows about 5 sign-ins per 15 minutes). This block forces one real login.

```bash drive
rm -f "$EV/auth-state.json"
"$RUN" signin
"$RUN" expect "Projects" "Send feedback"
playwright-cli -s=hi2vi-verify screenshot --filename="$EV/sign-in.png"
"$RUN" signin
```

**Proof:** the browser ends on `/dashboard` showing "Projects" and "Send feedback"; the second `signin` says "reused the saved sign-in, no new login"; `grep -rF <password>` over the evidence folder finds nothing (`down` checks it).
