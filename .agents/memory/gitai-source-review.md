---
name: GitAI canonical-source review
description: Review local GitAI work against the existing public upstream before publication.
---

Do not publish from a workspace/task branch until its base is reconciled with the current canonical main. Inspect changed paths and preserve upstream identity, branch-protection workflows, and unrelated security fixes. Never carry `.agents` or secret/private memory into published GitAI source.

**Why:** The repository can advance independently in parallel. A stale local branch may delete required upstream identity or CI even when its own tests pass.

**How to apply:** Fetch canonical main read-only, compare the merge base and conflicts, selectively port reviewed changes to a new branch, and rerun CI/security checks. Do not force-push or publish on the owner's behalf.
