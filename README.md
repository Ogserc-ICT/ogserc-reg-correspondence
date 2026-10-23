# OGSERC Registry System — Claude Code handoff

A standalone web app that replaces the Registry Correspondence Workbook.
Separate from the Registration & Evaluation app.

## What's inside
- `CLAUDE.md` — read automatically by Claude Code: stack, rules, build phases 0–8
- `docs/SPEC.md` — every rule from the workbook's formulas and VBA, Excel problems to fix, open questions, test fixtures
- `docs/TEMPLATES.md` — acknowledgement slip, Daily Register, Pending Actions, on-screen messages
- `seed-data.json` — 31 incoming types, 23 outgoing types, units, LGAs, lists, settings, 2026–27 holidays
- `assets/` — put the OGSERC logo here (copy logo.png from the Registration & Evaluation pack)
- `reference/` — the original .xlsm and its extracted VBA

## Setup (VS Code)
1. Make a new empty folder, e.g. `ogserc-registry`, and unzip this pack into it.
2. Copy the OGSERC logo into `assets/`.
3. In the terminal: `git init`, then `git add . && git commit -m "docs: registry handoff"`
4. Create an empty GitHub repo and push.
5. Open Claude Code in that folder (Plan mode).

## First prompt
> Read CLAUDE.md and docs/SPEC.md. Do Phase 0 only. Stop and summarise when finished, including the open questions you need me to answer.

## Next prompts
> Do Phase 1 only. Phase 1 is done when every fixture in SPEC §12.1, §12.2, N1, N2 and N5 passes. Stop and summarise.

> Do Phase {n} only, as written in CLAUDE.md. Stop at its "Done when" and summarise what changed, what you decided, and any open questions.
