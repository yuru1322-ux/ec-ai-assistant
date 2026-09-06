# Agent Instructions

This project is developed jointly by Claude Code and Codex. **`CLAUDE.md` at
the repo root is the canonical instructions file for both tools** — read it in
full before making any change or running any command. Do not treat it as
Claude-specific; the filename is historical, the content applies to any
coding agent working in this repo.

If your tooling does not automatically load `CLAUDE.md`, open and read it now.

## Critical rules (also in `CLAUDE.md` — restated here in case that file is not auto-loaded)

- Never run `npm start` or otherwise execute/require `src/index.js` without
  the user's explicit, per-run permission. It writes live to the production
  Google Sheet (columns D–M) and updates status on every row it touches.
- Never run the pipeline with an empty or assumed `END_ROW`. Row range
  (`START_ROW`/`END_ROW` in `.env`) is a per-run setting the user must confirm
  explicitly each time — never infer it, never default to "the whole sheet."
- Never edit columns A, B, C, or N in Google Sheets — these are client input
  columns.
- Never commit or push `.env`, OAuth JSON/token files, `images/`, `logs/`, or
  `node_modules/`.
- Never commit or push git changes unless the user explicitly asks.
- Do not bypass Cloudflare/Akamai/bot protection or other access controls,
  and do not weaken the shop-specific scrapers under `src/shops/`.
- Verification/read-only checks must never include execution, write, or
  delete operations — see "Safety Rules For Verification" in `CLAUDE.md` for
  exactly which modules are safe to load and which are not.

## Keeping this file in sync

`CLAUDE.md` holds the full, current rule set (pricing rules, spreadsheet
columns, prohibitions, safety rules, etc.) and changes over time as the
client's requirements evolve. This file intentionally does not duplicate that
detail — read `CLAUDE.md` itself rather than relying on the summary above,
which only exists as a fallback for the handful of highest-risk actions.
