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

**Status at end of session (usage limit reached):** setup work is committed on local branch `claude/setup`
but has NOT been pushed or opened as a PR. `gh` auth on the PC is expired. The Playwright suite was written
but had not finished its first run (Chromium was still downloading), so the e2e tests are **unverified**.
Lint ✅, typecheck ✅ (from before the e2e files were added; recheck), unit tests not re-run after the timeout fix.
Not started: Phase 1 items, Phase 2 scheduled task.
**E2E first run: both Playwright tests FAIL** (`offline-launch`, and `offline-sync` waiting for the pill to
reach `synced` after setup). Traces are in `test-results/` (gitignored). These must be debugged before the setup
PR can go green — the setup PR must not be merged with them failing.
