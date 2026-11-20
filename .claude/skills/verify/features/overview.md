# Overview (`/dashboard`)

**Reach it:** sign in; the app lands on `/dashboard`. The header's org link and the "Overview" tab lead back to it.

**Drive it:** open it signed in and read the org heading, the usage and document counts and the Projects table (the test account's own org has `hi2vi`, made by `up`, and `default`).

```bash drive
"$RUN" signin
playwright-cli -s=hi2vi-verify goto "$WEB/dashboard"
"$RUN" expect "Usage, last 30 days" "Projects" "hi2vi" "default"
playwright-cli -s=hi2vi-verify find "Projects"
playwright-cli -s=hi2vi-verify screenshot --filename="$EV/overview.png"
```

**Proof:** URL `/dashboard`; the texts "Usage, last 30 days" and "Projects"; a Projects row `hi2vi` (Private, Keys 1 or more) and a row `default`. `overview.png` is the picture of the signed-in product.
