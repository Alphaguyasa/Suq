# DAILY LOG — Suq

One entry per run, newest first. Each entry ends with the REPORT table (CLAUDE.md §13).

---

## 2026-10-18 — Run 3 (scheduled)

**Start.** `master` @ `922f951`, CI green, no open PRs. No run on 2026-10-17 (nothing in the log or git history).
I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging`, not Suq. The
`received_at` migration is still unapplied.

**Item 5: receipts and products open offline → [PR #12](https://github.com/Alphaguyasa/Suq/pull/12), merged.**
- `/sales/[id]`, `/products/[id]` and `/products/[id]/stock` became the static shells `/sales/view?id=`, `/products/edit?id=` and `/products/stock?id=`.
  - They are precached.
  - A service-worker navigation rule serves the shell whatever the query string, because the precache only matches its exact URL.
  - `lib/routes.ts` builds every link. The old paths redirect.
- **Found while testing: a PIN prompt in the middle of the demo.** Offline, Next's router cannot fetch the next page's data, so every link tap becomes a full page load. A full load reset the in-memory lock. The cashier had to enter the PIN again just to see the receipt, and the same happened on any offline navigation.
  - Fix: the unlocked cashier is remembered per tab in `sessionStorage`.
  - The 5-minute idle timeout still applies, "lock now" clears it, and a removed cashier is not restored.
  - A cold launch still locks.
- **Found while testing: the offline e2e tests could pass when they should fail.** In Chromium, `context.setOffline()` lets the service worker's own fetches through. The first version of the new spec passed even on a build without the fix.
  - The spec now also blocks the app origin with `context.route`. I checked that it fails without the SW rule and passes with it.
  - The older offline specs use only `setOffline` → new ROADMAP item 18.
- Local: lint ✅ · typecheck ✅ · unit 170 ✅ · build ✅ · e2e 6/6 ✅. CI green on the first try. Squash-merged as `204fb5f`.

**Item 6: Dexie upgrade survival tests → [PR #13](https://github.com/Alphaguyasa/Suq/pull/13), merged.**
- Versions now live in an append-only `SCHEMA_VERSIONS` list. The indexes are unchanged.
- New `openAtVersion()` helper.
- `lib/db/upgrade.test.ts` opens a database at v1 and at v2 and fills every table. It upgrades the database to v3 and checks:
  - rows, the receipt counter and indexed queries
  - that the newer tables are writable and the outbox id sequence continues
- It also freezes the published versions and requires a fixture for every table.
- I checked that it catches real breakage: an upgrade that clears `sales`, and a v1 index that was edited.
- Local: lint ✅ · typecheck ✅ · unit 180 ✅ · build ✅ · e2e 6/6 ✅.

**Blocked:** the release tag. `git push origin v2026-10-18-1` was refused again (the remote hung up). Rollback SHAs:
`v2026-10-18-1` = `204fb5f`, `v2026-10-18-2` = `7e19f07`.
**Process notes:**
- One session branch again. After #12 merged, I restarted the branch from master. I folded the old head back in with `merge -s ours`, so the push was a fast-forward with no force-push.
- The pre-commit hook is still not executable (item 17). I ran `sh .githooks/pre-commit` by hand before each commit: clean.

### REPORT — 2026-10-18
| Field | Content |
|---|---|
| Done | Item 5: receipts/products open offline + no PIN re-prompt on offline navigation — [PR #12](https://github.com/Alphaguyasa/Suq/pull/12). Item 6: Dexie upgrade survival tests — [PR #13](https://github.com/Alphaguyasa/Suq/pull/13) |
| Merged | PR #12: yes · PR #13: yes · tags `v2026-10-18-1`/`-2` NOT pushed (refused); SHAs `204fb5f` / `7e19f07` |
| Failed or blocked | Tag pushes; `received_at` migration still unapplied (connector can't see Suq) |
| Roadmap | 11 open (items 7–18); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | **Apply the received_at migration** (SQL Editor, 1 min) or reconnect the Supabase connector; tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 7 (device reset → duplicate receipt numbers), item 8 (indexed outbox status, Dexie v4 using item 6's helper) |

---

## 2026-10-16 — Run 2 (scheduled)

**Start.** `master` @ `c059ad9`, CI green, no open PRs. Read CLAUDE.md, ROADMAP, DAILY_LOG, NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged from yesterday and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging`, not Suq.

**Item 3: pull watermark in the server's clock → [PR #9](https://github.com/Alphaguyasa/Suq/pull/9), merged.**
- Additive migration `20261016000000_received_at.sql`. It adds `received_at` to the four synced tables, stamped by a trigger with `clock_timestamp()` so any client value is ignored. It also adds `(shop_id, received_at, id)` indexes. Existing rows get the migration time.
- Pull now filters on `received_at` and re-reads 2 minutes behind the watermark, to catch rows stamped before a pull but committed after it.
- The first pull after the switch starts from the beginning. That recovers rows the old filter had already skipped.
- Pull falls back to `created_at`/`updated_at` on `42703` (column missing), so the PR was safe to merge before the migration.
- `received_at` is never stored locally or pushed.
- Tests:
  - FakeServer now models "pushed late". New cases: a late offline sale, a product edit from a till with a slow clock, the overlap window, and legacy-then-migrated recovery.
  - New `supabase/migrations.test.ts` applies every migration to real Postgres via PGlite (dev dependency `@electric-sql/pglite` 0.5.8, Apache-2.0, pinned to a release 7 weeks old). It checks the trigger, duplicate pushes, that existing rows survive, and that RLS still applies.
- **The migration is not applied to production** (connector gap), so it is now in NEEDS_APPROVAL.

**Item 4: persistent storage → [PR #10](https://github.com/Alphaguyasa/Suq/pull/10), merged.**
- `navigator.storage.persist()` is requested once on first run, after the device row exists. The outcome and time are recorded on `device_meta` (optional fields, no Dexie bump).
- Settings shows the live state with bilingual text, a hint and an "ask again" button.
- Unit tests and a new e2e spec. Headless Chromium records a state, and the test accepts any of the three.

Local gates on both PRs: lint ✅ · typecheck ✅ · unit (152 → 161) ✅ · build ✅ · e2e (2 → 3) ✅. CI green
the first time on both; both squash-merged with trailer-free messages.

**Blocked:** release tags again (HTTP 403 from the session git proxy). Rollback SHAs: `v2026-10-16-1` =
`2c92d3b`, `v2026-10-16-2` = `943f9f0`.
**Process notes:**
- One session branch again. After PR #9 merged, I did not force-push. I merged the old branch head back in, so every push was a fast-forward.
- The pre-commit hook is still ignored because the file isn't executable (item 17). I ran the scanner's patterns over each diff by hand: clean.

### REPORT — 2026-10-16
| Field | Content |
|---|---|
| Done | Item 3: late-pushed rows now reach every till (server `received_at` watermark) — [PR #9](https://github.com/Alphaguyasa/Suq/pull/9). Item 4: persistent storage requested + shown in Settings — [PR #10](https://github.com/Alphaguyasa/Suq/pull/10) |
| Merged | PR #9: yes · PR #10: yes · tags `v2026-10-16-1`/`-2` NOT pushed (403); SHAs `2c92d3b` / `943f9f0` |
| Failed or blocked | Migration for item 3 not applied to Supabase (connector can't see the Suq project); tag pushes |
| Roadmap | 13 open (items 5–17); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | **Apply the received_at migration** (SQL Editor, 1 min) or reconnect the Supabase connector; tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 5 (receipt/product pages offline), item 6 (Dexie upgrade survival tests) |

---

## 2026-10-15 — Run 1 (scheduled)

**Start.** `master` @ `7f947ce`, CI green. Read CLAUDE.md, ROADMAP, DAILY_LOG, NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), the newest Opus. The models page now lists
**Claude Fable 5.1** (`claude-fable-5-1`) above Opus ("for demanding reasoning and long-horizon agentic work",
2.5× Opus's API price). CLAUDE.md §10 says "or any higher tier", so this is flagged as ACTION FOR ALPHA — this
run cannot change the routine's model itself.

**Item 1 — patch vulnerable dependencies → [PR #3](https://github.com/Alphaguyasa/Suq/pull/3), merged.**
Next 15.5.22 → 15.5.28; `postcss` forced to ^8.5.30 via `overrides` (Next 15 pins 8.4.31 and the only
audit-suggested fix was Next 16); `npm audit fix` for the rest. `npm audit --omit=dev`: 8 (1 critical) → **0**.
CI gained `npm audit --omit=dev --audit-level=high`. Dev-only advisories (vitest, undici via jsdom, braces)
remain: bumping them crashes npm 10's arborist (`reading 'edgesOut'`) — new ROADMAP item 16.

**Item 2 — pull pagination → [PR #4](https://github.com/Alphaguyasa/Suq/pull/4), merged.** Keyset pages
of 500 on (watermark, id) until a short page; watermark committed only after all pages of all tables; a
cursor-ignoring server fails fast instead of looping. FakeServer enforces a 1000-row cap. New tests: 2,345
rows past the cap, 537 rows sharing one timestamp across a page boundary, network drop between pages,
stuck cursor. The PostgREST `or=(…)` keyset filter is exercised only by the in-memory fakes, not yet by a
real Supabase (the live suite does not run in CI) — worth one `SUQ_LIVE=1` run with > 500 rows.

Local gates on both PRs: lint ✅ · typecheck ✅ · unit (141) ✅ · build ✅ · e2e 2/2 ✅. CI green on both
first time; both squash-merged.

**Blocked:** release tags. `git push origin <tag>` is refused (HTTP 403) by this cloud session's git proxy,
which only allows the session's own branch; the GitHub connector has no tag API. Rollback points:
`v2026-10-15-1` = `c75669a`, `v2026-10-15-2` = `ad3de63`.
**Process notes:** this cloud session may only push to its assigned branch (`alpha/gifted-brown-o6q460`),
not `claude/<slug>` — both items went through it one after the other (PR, merge, restart from master).
Found that the pre-commit secret scanner never runs (file not executable) — ROADMAP item 17.
In this container Playwright's bundled Chromium differs from the preinstalled one; e2e ran locally with
`executablePath: /opt/pw-browsers/chromium` via a throwaway config (CI unaffected).

### REPORT — 2026-10-15
| Field | Content |
|---|---|
| Done | Item 1: prod deps patched (Next critical, 0 prod advisories) + CI audit gate — [PR #3](https://github.com/Alphaguyasa/Suq/pull/3). Item 2: paginated pull, no more truncation at 1000 rows — [PR #4](https://github.com/Alphaguyasa/Suq/pull/4) |
| Merged | PR #3: yes · PR #4: yes · tags `v2026-10-15-1`/`-2` NOT pushed (403 from session git proxy); SHAs `c75669a` / `ad3de63` |
| Failed or blocked | Tag pushes blocked; dev-only advisories not fixable today (npm crash) |
| Roadmap | 15 open (items 3–17); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier than Opus |
| Needs approval | Tags/permissions; Fable 5.1 switch; routine settings; branch protection; hosting costs |
| Next | Item 3 (late-arriving rows: server `received_at` watermark — additive migration), item 4 (storage persistence) |

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
