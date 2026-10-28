---
name: GitAI RunPod compute approval
description: Owner-selected compute provider and delegated hardware selection.
---

The owner approved connecting RunPod's API to GitAI and delegated GPU selection.

**Why:** the owner asked to link RunPod and use whichever GPU is best.

**How to apply:** Select hardware for the actual chosen model/workload, rather
than assuming the largest GPU is best. Keep credentials in Project Secrets.
Provider approval does not establish a spending ceiling or certify isolation
for hostile user code; retain explicit workload and runtime limits.
