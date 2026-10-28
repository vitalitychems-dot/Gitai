---
name: GitAI backup policy
description: Owner-selected storage roles and evidence required before claiming backup readiness.
---

Use App Storage for GitAI's primary private object storage and a separate private Cloudflare R2 bucket as the backup. Synthetic transport tests are not evidence of a live R2 backup; verify a real upload and independent restore before describing it as ready.

**Why:** the owner selected this storage split, and backup readiness requires an independent copy that can actually be restored.

**How to apply:** Keep production readiness blocked until repository/database consistency and a live R2 upload/restore are tested. Do not treat adapter code or mock tests as a configured backup.
