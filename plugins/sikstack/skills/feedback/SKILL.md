---
name: feedback
description: "Send sikstack a short report about something that went wrong or could be better: drafts it, shows it, and sends it only on your yes. Needs no sign-in."
argument-hint: "[what happened, in a line]"
allowed-tools: Bash(sikstack feedback:*)
disable-model-invocation: true
---

# feedback

A short report to the people who make sikstack, keyed by this machine's install id: no sign-in and no workspace needed. What the user said, if anything: $ARGUMENTS

1. **Draft the report**, three short lines at most:
   - what happened (the command or step, and what it printed, in your own words);
   - what was expected;
   - the plugin version (`sikstack --version` is not a command: read it from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`).

   Leave out code, file paths outside the plugin, the repo's name and any transcript text: describe, never paste.
2. **Show it** to the user as it will be sent, and ask whether to send it. Send only on a clear yes; on a no or a change, redraft or stop.
3. **Send it** on that yes, exactly:

   ```
   sikstack feedback --data-dir "${CLAUDE_PLUGIN_DATA}" <<'REPORT'
   <the report>
   REPORT
   ```

4. **Report** the one line it printed: sent, or why not (a limit reached, the server unreachable, a path or the repo's name still in the report).
