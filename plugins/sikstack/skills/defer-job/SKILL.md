---
name: defer-job
description: Park work as a deferred job folder, outside active backlog selection.
allowed-tools: Bash(sikstack:*)
disable-model-invocation: true
---

# defer-job

Run `sikstack defer-job $ARGUMENTS` (`--title "…" --reason "…" --trigger "…" --source <slice>`, optionally `--agenda <AID>`). Leave out `--id`: the engine mints `D92-x4` and prints it. A deferred job never affects `next` until promoted.
