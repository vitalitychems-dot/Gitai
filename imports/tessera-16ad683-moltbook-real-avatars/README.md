# Imported from TESSERA: branch gitai/moltbook-real-avatars (commit 16ad683)

Saved on Oct 26, 2026 before the box reset. Father wants Gitai content in the Gitai repo.

This commit was made in the TESSERA repo and was never pushed to GitHub. It was found only on the box, in a TESSERA mirror (branch `gitai/moltbook-real-avatars`, commit `16ad683ef48c3f3fbc85888ce9f9e43adcbe4ac1`, author vitalitychems-dot, "GitAI: opt-in Moltbook identity connector and real-user-only avatars").

Gitai has a different history from TESSERA, so the commit can't be pushed here as-is: that would drag the whole TESSERA history into Gitai. Its patch also doesn't apply to Gitai's current `artifacts/gitai/` layout. So the commit is preserved here in three forms, and nothing in Gitai's own code was changed:

- `16ad683.patch` is the exact change (`git format-patch`).
- `16ad683.bundle` is the exact commit. Its parent `23999aa` is on TESSERA's GitHub history. To restore it, run `git fetch 16ad683.bundle` inside a TESSERA clone.
- `artifacts/gitai/...` holds the 10 changed files as they were at 16ad683, for reference when porting.

The commit was secret-scanned before upload (gitleaks 8.21.2 plus key patterns): clean.
