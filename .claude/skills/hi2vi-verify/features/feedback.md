# Feedback

**Reach it:** the "Send feedback" button on `/dashboard` (hi2vi's own feedback control, posting with the capture key `up` minted) sends; the "Feedback" tab (`/feedback`) lists what arrived, across the org's projects.

**Drive it:** send one message from the dashboard dialog, then find it in the list.

```bash drive
"$RUN" signin
playwright-cli -s=hi2vi-verify goto "$WEB/dashboard"
playwright-cli -s=hi2vi-verify click 'role=button[name="Send feedback"]'
playwright-cli -s=hi2vi-verify fill 'role=textbox[name="Message"]' "verify skill feedback check"
playwright-cli -s=hi2vi-verify click 'role=button[name="Send"]'
"$RUN" expect "Feedback sent"
playwright-cli -s=hi2vi-verify goto "$WEB/feedback"
"$RUN" expect "verify skill feedback check"
playwright-cli -s=hi2vi-verify screenshot --filename="$EV/feedback.png"
```

**Proof:** the dialog turns into "Feedback sent"; `/feedback` shows a row "verify skill feedback check" with Project `hi2vi`, Product `hi2vi`, When "just now". Its link opens `/feedback/<id>`.
