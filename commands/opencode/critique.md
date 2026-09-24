---
description: Measured visual critique of the current build (vs reference if .design/ref exists)
agent: frontend
---
Run one measured critique pass on: $ARGUMENTS

Capture the running app with the visual-fidelity tool at the viewports in .design/brief.md (default 1440x900,390x844) into the next .design/cur/iter-N. Compare against .design/ref if it exists. Then call visual-critic and show me its P0/P1 list. Do NOT change code unless I say so.
