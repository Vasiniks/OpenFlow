---
description: One-shot recreation of a reference website's look AND feel — whole site, motion, mouse, transitions, 3D, assets — looped autonomously until the inventory is done, then one A/B checkpoint
agent: frontend
---
Recreate this website in the current project. Mode: RECREATE.

Reference: $ARGUMENTS

- **Scope:** the WHOLE site (every page the teardown finds), unless the arguments narrow it.
- **Route:** `src/app/recreate/<slug>/`.
- **Viewports:** desktop 1440x900 is primary; mobile is a sanity pass only.

Follow your STEP 0–9 procedure exactly:
- teardown the whole site;
- superprompt and inventory;
- assets;
- specs;
- build every page;
- loop (measure with `vf feel` + critique + fix ALL P0/P1) until the inventory is done and feel parity is ≥ 90%;
- mobile sanity.

Do not stop or ask me anything before STEP 9. At STEP 9, show me two A/B alternatives for the two most feel-defining items, and ask for feedback.
