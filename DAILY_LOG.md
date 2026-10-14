# DAILY LOG — Suq

One entry per run, newest first. Each entry ends with the REPORT table (CLAUDE.md §13).

---

## 2026-10-14 — Run 0 (interactive setup with alpha)

**Phase 0 audit.** Read the whole codebase and docs. Baseline on `master` @ `63c9636`:
typecheck ✅ · build ✅ · unit tests 136 pass / 1 flaky (the 200-sale cold-start sync test times out at the
5s default when the full suite runs in parallel; passes alone) · no lint config · no CI · no Playwright.
UI is bilingual (Amharic default, English toggle) via `lib/i18n` — confirmed and documented as a rule.

Findings written to ROADMAP.md (14 items). The most serious:
- Critical/high `npm audit` advisories in production deps (Next.js critical).
- Pull watermark mismatch: server-clock watermark vs device-clock `created_at` → a till never receives the
  other till's offline sales once it has pulled in between. Core multi-device promise broken.
- `navigator.storage.persist()` never requested (project rule).
- Receipt / product detail pages are dynamic routes and fail offline (hit right after a sale in the demo).
- Pull is not paginated → silent truncation at the PostgREST row cap.
- No test that old IndexedDB data survives the v1→v3 Dexie upgrades (project rule).

**Setup PR (`claude/setup`).** Added CLAUDE.md (architecture, commands, all policies verbatim), ROADMAP.md,
DAILY_LOG.md, NEEDS_APPROVAL.md; ESLint 9 flat config (`npm run lint`); Playwright (Chromium) with an in-memory
fake Supabase and the required offline→sales→reconnect→sync e2e test; `.github/workflows/ci.yml` (install,
lint, typecheck, unit, build, e2e) with dummy env; fixed the flaky timeout.

**Two real bugs found by the new e2e tests and fixed in the setup PR** (they blocked CI from going green):
- *Offline cold launch failed with `net::ERR_FAILED`.* The service worker precached JS/CSS but no page HTML,
  so a till that was set up and then opened in airplane mode got nothing — not even `/offline`. Fix: precache
  every static route (`additionalPrecacheEntries` in `next.config.ts`, revisioned per commit).
- *A fresh device with a saved login never adopted its shop.* `adoptShopFromMembership()` ran before the device
  was registered, threw, and the error was swallowed; every push was then rejected by RLS forever (pill stuck
  on "syncing"). Hits every till after "reset device". Fix: register the device first (`lib/sync/shop.ts`).
- Docs: README said CSV prices are in cents; the importer (correctly) takes birr. README fixed.

Local gates on `claude/setup`: lint ✅ · typecheck ✅ · unit 137 ✅ · build ✅ · e2e 2/2 ✅.

**CI on PR #1:** first run failed — a test bug (`pay()` read the previous sale's lingering confirmation on the
fast runner; server data was correct). Fixed on the same branch (attempt 1 of 2), all checks green, squash-merged,
tagged `v2026-10-14-1`.

**Phase 1:** started roadmap item 1 (dependency security patch) — `npm audit fix` was **killed by Claude Code
because the PC ran critically low on memory**; nothing had been changed. Left for the first scheduled run, which
has its own cloud machine.

**Phase 2:** created routine *Suq daily autonomous dev* (trig_01QtYEsG3ee6NtS952hJFkTM), daily 07:00 Nairobi,
model alias `opus`. First run 2026-10-15 07:00. Needs two settings from alpha (see NEEDS_APPROVAL.md).

**Model check:** running on Claude Opus 5.5 (`claude-opus-5-5`), the newest Opus-class model available; the
routine uses the `opus` alias so it follows new releases automatically.

### REPORT — 2026-10-14
| Field | Content |
|---|---|
| Done | Project setup: docs, ESLint, Playwright offline e2e, CI, 2 offline/sync bug fixes — [PR #1](https://github.com/Alphaguyasa/Suq/pull/1) |
| Merged | PR #1: yes · `v2026-10-14-1` |
| Failed or blocked | Roadmap item 1 (deps patch) not done: local `npm audit fix` killed for low memory on the PC |
| Roadmap | 14 open; no replan needed |
| Model | Claude Opus 5.5; routine on alias `opus` |
| Needs approval | Set routine to "Automatically approve" + push notifications ON; optional branch protection; hosting costs before first client |
| Next | Item 1 (patch Next.js critical + other advisories, add `npm audit` CI gate), item 2 (pull pagination) |
