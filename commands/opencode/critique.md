---
description: Measured critique of the current build — pixels vs reference (if any) and the Awwwards definition-of-done gates
agent: frontend
---
Run one measured critique pass on: $ARGUMENTS

1. **Capture.** Capture the running app with the visual-fidelity tool at the viewports in `.design/brief.md` (default 1440x900,390x844) into the next `.design/cur/iter-N`. Compare against `.design/ref` if it exists.
2. **Teardown.** Run `vf teardown <app-url> --out .design/cur/iter-N/teardown --pages 2` (build motion, assets, hover and 3D evidence).
3. **Critique.** Call `visual-critic` with both, and show me its scorecard, the gate table and the P0/P1 list.

Do NOT change code unless I say so.
