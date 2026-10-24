---
name: Browser test environment
description: Nix-specific trusted app browser test limitation.
---

The stock Chromium downloaded by Playwright cannot start in this Nix environment
because its expected shared libraries are absent. A Nix-provided system Chromium
works when passed as an explicitly resolved executable path.

**Why:** Treating the launch failure as an app failure wastes time; changing app
code does not fix a browser shared-library loader problem.

**How to apply:** Use the package-managed system browser for trusted app tests.
These browser tests are not evidence of an isolated untrusted-code runner and
must never be represented as such.
