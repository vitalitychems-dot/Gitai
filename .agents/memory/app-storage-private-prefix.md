---
name: App Storage namespace prefixes
description: Provider-assigned PRIVATE_OBJECT_DIR parsing and safe archive paths.
---

Replit App Storage can assign a private object prefix whose first segment starts with a dot. Accept safe dot-prefixed path components; reject only empty components, separators/control characters and `.`/`..` traversal segments. Keep bucket-name validation separate from object-prefix validation.

**Why:** The supported object-storage template parses provider paths as bucket/object names and does not require each object prefix to start with an alphanumeric character. A stricter locally invented rule can reject a valid provisioned private namespace.

**How to apply:** When extending App Storage, validate the canonical provider-assigned private prefix without displaying it, then exercise a small synthetic write/read/delete in that exact namespace before relying on it.
