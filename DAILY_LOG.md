# DAILY LOG — Suq

One entry per run, newest first. Each entry ends with the REPORT table (CLAUDE.md §13).

---

## 2026-10-29 — Run 15 (scheduled)

**Start.** `master` @ `dcfc232`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`). It is still the newest Opus on the models page
(platform.claude.com), and Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` (ACTIVE) and `erko-staging` (INACTIVE), not Suq.
The two migrations are still unapplied.

**Item 16: dev-tooling advisories → [PR #49](https://github.com/Alphaguyasa/Suq/pull/49), merged.**
- `npm audit` (dev included) went from 4 advisories (undici high, vite high, vitest/@vitest/mocker moderate) to 0.
  vitest 4.1.12, vite 8.3.5, undici 8.12.3. `braces` is no longer flagged.
- npm 10 (`npm audit fix`) still crashes with `edgesOut`. `npx npm@11 audit fix` worked. npm 10's `npm ci` installs the
  new lockfile unchanged, which I checked from an empty `node_modules`.
- Local: lint ✅ · typecheck ✅ · unit 356 ✅ · build ✅. CI green on the first try. Squash-merged as `a23fb33`.

**Item 31: share a receipt as text → [PR #50](https://github.com/Alphaguyasa/Suq/pull/50), merged.**
- `receiptText()` builds the receipt as plain text in the UI language, with the same content as the printout.
  `ShareReceiptButton` on the receipt page works like this:
  - It opens the Web Share sheet (Telegram, SMS). Closing the sheet shows nothing.
  - If sharing fails or the browser has no share sheet, the text is copied to the clipboard.
  - If the browser can neither share nor copy, the button is hidden.
- Tests: 11 unit tests and a new offline e2e test (`e2e/share-receipt.spec.ts`) that stubs `navigator.share`.
- Local: lint ✅ · typecheck ✅ · unit 367 ✅ · build ✅ · e2e 24/24 ✅. CI green on the first try. Squash-merged as `e931bbe`.

**Found along the way (new item 35).** After setup no unlocked session is written. So the first full page load, such as
an offline tap on "Sale complete" right after setup, asks for the PIN. The demo walks straight into it.

**Replan.** 6 items were open and only 30 and 32 could be worked. I did a short audit (audit clean, no TODOs, `npm outdated`,
lock state, gaps left by earlier items) and added items 35–39. 11 items are now open.

**Process note.** The session branch still held the squash-merged commit of #49. I merged it into the next branch instead
of force-pushing (CLAUDE.md forbids force-pushes), and the squash merge drops it. Same Playwright mismatch as runs
12–14; the same symlinks in `/opt/pw-browsers` fixed it locally.

**Blocked:** release tags (refused as before). Rollback SHAs are in NEEDS_APPROVAL.

### REPORT — 2026-10-29 (run 15)
| Field | Content |
|---|---|
| Done | Item 16: dev-tooling advisories at 0 — [PR #49](https://github.com/Alphaguyasa/Suq/pull/49). Item 31: share a receipt as text (Telegram/SMS, works offline) — [PR #50](https://github.com/Alphaguyasa/Suq/pull/50) |
| Merged | PR #49: yes (`a23fb33`) · PR #50: yes (`e931bbe`) · tags `v2026-10-29-1`/`-2` NOT pushed (refused) |
| Failed or blocked | Tag pushes; items 12/33 wait for alpha; items 13/27 wait for the migrations |
| Roadmap | 11 open (12, 13, 27, 30, 32, 33, 35–39), 4 of them blocked; replan done |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations** (or reconnect Supabase to the Suq org); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 35 (setup unlocks the first cashier), item 36 (keyboard focus order) |

---

## 2026-10-28 — Run 14 (scheduled)

**Start.** `master` @ `ac1f6cc`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page
(platform.claude.com). Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
The two migrations are still unapplied.

**Item 18: offline e2e tests refuse the app origin → [PR #46](https://github.com/Alphaguyasa/Suq/pull/46), merged.**
- `goOffline()` (setOffline + abort every request to `localhost:<port>`) and a new `goOnline()` live in `e2e/helpers.ts`.
  The cold-launch and offline-sync tests use them. The fake Supabase (127.0.0.1) keeps its own offline switch.
- Honest note: a negative control (page fetch and navigation to un-precached URLs with only `setOffline`) was refused
  too in today's build. So no live leak was found; this only makes the tests stricter.
- Local: lint ✅ · typecheck ✅ · unit 356 ✅ · build ✅ · e2e 22/22 ✅. CI green on the first try. Squash-merged as `a2e3757`.

**Item 28 (setup save failure) → [PR #47](https://github.com/Alphaguyasa/Suq/pull/47), merged.**
- New e2e test: refused shop settings (step 1) and a refused first cashier (step 3) keep the wizard on the step, keep
  what was typed, and say why.
- **Real bug found:** the retry, two taps in the same task, added the first cashier **twice**. The `busy` state is stale
  until React re-renders. A ref now guards `next()`. A real `dblclick` did not trigger it, but taps a slow phone delivers
  back to back would.
- Local: lint ✅ · typecheck ✅ · unit 356 ✅ · build ✅ · e2e 23/23 ✅. CI green on the first try. Squash-merged as `6aec552`.

**Environment note.** Same Playwright mismatch as runs 12–13; the same symlinks in `/opt/pw-browsers` fixed it locally.

**Roadmap.** 8 open, but 4 of them wait for alpha or the migrations (12, 13, 27, 33). Only 16, 30, 31 and 32 can be
worked. No replan was required (≥ 5 open). The next run should replan if the waiting items are still blocked.

**Blocked:** release tags (refused as before). Rollback SHAs are in NEEDS_APPROVAL.

### REPORT — 2026-10-28 (run 14)
| Field | Content |
|---|---|
| Done | Item 18: offline e2e tests also refuse the app origin — [PR #46](https://github.com/Alphaguyasa/Suq/pull/46). Item 28: setup save-failure test + fix for the first cashier being added twice on a double tap — [PR #47](https://github.com/Alphaguyasa/Suq/pull/47) |
| Merged | PR #46: yes (`a2e3757`) · PR #47: yes (`6aec552`) · tags `v2026-10-28-3`/`-4` NOT pushed (refused) |
| Failed or blocked | Tag pushes; items 12/33 wait for alpha; items 13/27 wait for the migrations |
| Roadmap | 8 open (12, 13, 16, 27, 30–33), 4 of them blocked; no replan yet |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations** (or reconnect Supabase to the Suq org); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 16 (retry dev-tooling bumps), item 31 (share a receipt as text); replan if the blocked items are still blocked |

---

## 2026-10-28 — Run 13 (scheduled)

**Start.** `master` @ `807b8a7`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page
(platform.claude.com). Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
The two migrations are still unapplied.

**Item 29: owner page stops polling when hidden → [PR #43](https://github.com/Alphaguyasa/Suq/pull/43), merged.**
- `lib/hooks/useVisiblePolling.ts`: no timer while `document.visibilityState` is `hidden`, an immediate refresh on
  return, the latest task via a ref. `/owner` uses it instead of a bare 15s `setInterval`.
- Local: lint ✅ · typecheck ✅ · unit 321 ✅ · build ✅ · e2e 19/19 ✅. CI green on the first try. Squash-merged as `b919b5d`.

**Item 28: test gaps → [PR #44](https://github.com/Alphaguyasa/Suq/pull/44), merged.**
- Unit tests: `adoptShopFromMembership` (7), `lib/reports/period.ts` (18; also run under TZ Addis Ababa, New York,
  Auckland, UTC), `supabaseSyncClient` (10, incl. 42703 → `MissingColumnError`).
- E2e: a refused stock count, shop details and new cashier each say why, keep what was typed and save on retry.
- No bugs found this time. Setup's save-failure path stays open as a narrowed item 28.
- Local: lint ✅ · typecheck ✅ · unit 356 ✅ · build ✅ · e2e 22/22 ✅. CI green on the first try. Squash-merged as `f8fcd73`.

**Environment note.** Same Playwright mismatch as run 12 (`chromium_headless_shell-1248` wanted, 1243 installed);
the same symlink fixed it locally.

**Blocked:** release tags (refused as before). Rollback SHAs are in NEEDS_APPROVAL.

### REPORT — 2026-10-28 (run 13)
| Field | Content |
|---|---|
| Done | Item 29: owner page stops polling Supabase while hidden — [PR #43](https://github.com/Alphaguyasa/Suq/pull/43). Item 28: tests for shop adoption, report periods, PostgREST error mapping, and settings/adjust/cashier save failures — [PR #44](https://github.com/Alphaguyasa/Suq/pull/44) |
| Merged | PR #43: yes (`b919b5d`) · PR #44: yes (`f8fcd73`) · tags `v2026-10-28-1`/`-2` NOT pushed (refused) |
| Failed or blocked | Tag pushes; items 12/33 wait for alpha; items 13/27 wait for the migrations |
| Roadmap | 10 open (12, 13, 16, 18, 27, 28-setup, 30–33); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations** (or reconnect Supabase to the Suq org); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 18 (offline e2e hardening), then the setup save-failure test (item 28) |

---

## 2026-10-27 — Run 12 (scheduled)

**Start.** `master` @ `e636124`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page
(platform.claude.com). Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector is back in this session but still lists only `not-alone-scripture` and
`erko-staging` (INACTIVE), not Suq. The two migrations are still unapplied.

**Item choice.** Item 27 needs a `sale_items` column production does not have yet (pushes would fail until alpha
applies migrations), so it waits. I took item 34 (sync correctness), then item 28's unverified scanner check, which
turned out to be a real bug.

**Item 34: pulled timestamps in the till's format → [PR #40](https://github.com/Alphaguyasa/Suq/pull/40), merged.**
- Correction to the roadmap entry: trimmed Postgres text (`…00.1+00:00`) mostly still sorts by time against
  `…00.100Z`. It does not at an equal instant. So a sale pulled at exactly a period boundary landed in the previous
  period, and two tills (own rows `Z`, the other till's `+00:00`) ordered a same-millisecond pair differently. With two
  voids of the same sale, each till would pick the other's void as THE void (breaks item 21's rule).
- `canonicalIso()` in `lib/db/timestamps.ts`; `apply.ts` rewrites pulled rows; Dexie v6 rewrites rows already pulled
  (canonical rows untouched; upgrade test v1–v5). The fake server can answer in Postgres text, and the new sync tests
  fail without the fix.
- Local: lint ✅ · typecheck ✅ · unit 315 ✅ · build ✅ · e2e 18/18 ✅. CI green on the first try. Squash-merged as `3c4c0e5`.

**Scanner double-add (from item 28) → [PR #41](https://github.com/Alphaguyasa/Suq/pull/41), merged.**
- A new e2e test typing each code and then Enter, like a USB scanner, got 3 waters + 2 breads for water, bread, water.
  Enter ran a second barcode lookup while the first was still pending, so **every scan with a scanner set to send
  Enter charged the item twice.** Fix: Enter waits for the typed lookup and reads the box itself.
- Local: lint ✅ · typecheck ✅ · unit 315 ✅ · build ✅ · e2e 19/19 ✅ (scanner spec 5/5 repeated). CI green on the first try. Squash-merged as `17042f7`.

**Environment note.** Playwright here wanted `chromium_headless_shell-1248` but the image has 1243; a symlink in
`/opt/pw-browsers` made the local e2e run (no repo change).

**Blocked:** release tags (refused as before). Rollback SHAs are in NEEDS_APPROVAL.

### REPORT — 2026-10-27 (run 12)
| Field | Content |
|---|---|
| Done | Item 34: pulled timestamps in the till's format — [PR #40](https://github.com/Alphaguyasa/Suq/pull/40). Scanner code + Enter no longer adds the item twice (real overcharge bug found by item 28's check) — [PR #41](https://github.com/Alphaguyasa/Suq/pull/41) |
| Merged | PR #40: yes (`3c4c0e5`) · PR #41: yes (`17042f7`) · tags `v2026-10-27-1`/`-2` NOT pushed (refused) |
| Failed or blocked | Tag pushes; item 12/33 wait for alpha; items 13/27 wait for the migrations; Supabase connector still cannot see Suq |
| Roadmap | 11 open (12, 13, 16, 18, 27–33); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations** (or reconnect Supabase to the Suq org); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 28 (remaining test gaps), item 29 (owner page stops polling when hidden) |

---

## 2026-10-26 — Run 11 (scheduled, second run today)

**Start.** `master` @ `59fa416`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page
(platform.claude.com). Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** This session has no Supabase connector tools at all, so the two migrations are still unapplied
and unchecked.

**Item 25: screens read stock from the cache → [PR #37](https://github.com/Alphaguyasa/Suq/pull/37), merged.**
- `cachedOnHandAll()` reads `stock_cache` (one row per product). Sale, products and reports use it instead of
  `onHandAll()`, which summed every movement on every change.
- Bug found on the way: pulled movements never refreshed the cache, so on a multi-till shop it had drifted from
  SUM(qty_delta). Nobody saw it only because nothing read the cache. `applyAppendOnly` now refreshes the touched
  products in the same transaction. The new tests fail without that change.
- Dexie v5: no store change; the upgrade rebuilds the cache once from the movements (entries that agree are left
  untouched, so the existing upgrade test still sees every row unchanged). New test: a stale v1–v4 cache is repaired.
- `recentProductIds`: one `anyOf` query instead of up to 40.
- Local: lint ✅ · typecheck ✅ · unit 291 ✅ · build ✅ · e2e 17/17 ✅. CI green on the first try. Squash-merged as `84c8908`.

**Item 26: reports and history read only what they show → [PR #38](https://github.com/Alphaguyasa/Suq/pull/38), merged.**
- Reports: current and previous period through the `created_at` index; only those sales' lines.
- History: newest 100 sales extended to whole days (a cut day would show a wrong day total), "show older sales"
  button (am/en). Search still covers all of history; voided marks come from the `voids_sale_id` index.
- Local: lint ✅ · typecheck ✅ · unit 294 ✅ · build ✅ · e2e 18/18 ✅ (new `e2e/sales-history.spec.ts`). CI: green (the push-triggered run hung installing Playwright before any test ran; cancelled and re-run once, green). Squash-merged as `da6578a`.

**Found:** pulled rows probably keep Postgres's `+00:00` timestamp text while local rows use `Z`; all `created_at`
ranges compare strings. New ROADMAP item 34 (P2 · S).

**Blocked:** release tags (refused as before). Rollback SHAs are in NEEDS_APPROVAL.

### REPORT — 2026-10-26 (run 11)
| Field | Content |
|---|---|
| Done | Item 25: screens read stock from the cache; pulled movements now keep it right — [PR #37](https://github.com/Alphaguyasa/Suq/pull/37). Item 26: reports and sales history read only what they show — [PR #38](https://github.com/Alphaguyasa/Suq/pull/38) |
| Merged | PR #37: yes (`84c8908`) · PR #38: yes (`da6578a`) · tags `v2026-10-26-3`/`-4` NOT pushed (refused) |
| Failed or blocked | Tag pushes; item 12 waits for alpha; item 13 waits for the migrations; migrations still unapplied (no Supabase connector in this session) |
| Roadmap | 11 open (12, 13, 16, 18, 27–34; 34 new); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations**; tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 27 (gross profit at cost-at-sale; needs a new `sale_items` column that production lacks until alpha applies migrations, so pushes must not send it before then — if that can't be done safely, item 28 first), item 28 (test gaps) |

---

## 2026-10-26 — Run 10 (scheduled)

**Start.** `master` @ `decbfdb`, CI green. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.
There is no log entry for 2026-10-25, but that run left draft [PR #33](https://github.com/Alphaguyasa/Suq/pull/33)
(item 23) open, green and unmerged on its own session branch. It seems to have stopped before merging and logging.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
The two migrations are still unapplied.

**Item 23: 56px touch targets → [PR #34](https://github.com/Alphaguyasa/Suq/pull/34), merged; #33 closed as superseded.**
- I reviewed #33. The UI change was right, but it had re-quoted the whole existing `e2e/a11y.spec.ts` to double
  quotes, and the repo uses single quotes with no prettier. This session can only push its own branch, so I carried
  the commit over, rewrote the spec in house style, and opened #34.
- Raised to 56px: quick-cash note buttons and "total" (were 34px tall), discount buttons (30px) and input (38px),
  the cart's remove ×, the sale-complete link, the sort/period/rank chips, the back links, and "voided as".
- New e2e gate: every visible control on the main screens, at 360px and 1280px, plus no sideways scroll on the phone.
- Local: lint ✅ · typecheck ✅ · unit 273 ✅ · build ✅ · e2e 16/16 ✅. CI green on the first try. Squash-merged as `89eaf6e`.

**Item 24: reset shows what has not synced → [PR #35](https://github.com/Alphaguyasa/Suq/pull/35), merged.**
- `unsyncedSummary()` counts the outbox and the sales in it. The danger section reads it live:
  - outbox not empty: an ochre box says how many records (and sales) exist only here and will be lost for good,
    with a "download a backup first (JSON)" button right there. It has its own label, so it is never confused
    with the Backup section's button;
  - outbox empty: it says everything has reached the server.
- The backup export is now one `useBackupExport()` hook shared by both places.
- The download is offered, not forced: the shop-name confirmation is still the gate.
- Tests: unit (empty, sale + void counted, drained, reset clears every table). e2e: synced → offline sale → warning
  with counts → the backup holds the sale → reconnect clears the warning → reset still goes to setup.
- Local: lint ✅ · typecheck ✅ · unit 277 ✅ · build ✅ · e2e 17/17 ✅. CI green on the first try. Squash-merged as `fd3fdbd`.

**Blocked:** release tags (refused as before). Rollback SHAs are in NEEDS_APPROVAL.

### REPORT — 2026-10-26
| Field | Content |
|---|---|
| Done | Item 23: every till control is a 56px touch target — [PR #34](https://github.com/Alphaguyasa/Suq/pull/34) (finishes yesterday's unmerged #33). Item 24: reset shows what has not synced and offers the backup first — [PR #35](https://github.com/Alphaguyasa/Suq/pull/35) |
| Merged | PR #34: yes (`89eaf6e`) · PR #35: yes (`fd3fdbd`) · tags `v2026-10-26-1`/`-2` NOT pushed (refused) |
| Failed or blocked | Tag pushes; the 2026-10-25 run stopped before merging #33 (finished today); item 12 still waits for alpha; item 13 waits for the migrations; migrations still unapplied |
| Roadmap | 13 open (12, 13, 16, 18, 25–33); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations** (or reconnect the Supabase connector); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 25 (sale screen re-reads every stock movement: use `stock_cache`), item 26 (reports/history read whole tables) |

---

## 2026-10-24 — Run 9 (scheduled)

**Start.** `master` @ `2e90ef3`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
The `received_at` and products last-write-wins migrations are still unapplied.

**CI gate went red overnight (fixed).** A new advisory, GHSA-mrhx-c7xc-m3w5 (zod < 4.6.6, high, memory exhaustion), is in a
production dependency: `@serwist/next` 9.5.13 (latest) pins `zod@4.6.5` exactly. `npm audit --omit=dev --audit-level=high`
failed every PR, and master would have too. Fix: `overrides.zod = ^4.6.6` (now 4.6.7), like the `postcss` override.
zod only validates the Serwist config at build time. Build and all 14 e2e (service worker / offline included) pass with it.
It went into PR #30 as its own `security:` commit because this session can only push one branch.

**Item 21: a sale voided on two tills → [PR #30](https://github.com/Alphaguyasa/Suq/pull/30), merged.**
- `voidSale` re-checks for an existing void inside its write transaction. A racing double void used to write two rows; there is a test for that, and it fails on the old code.
- New `reconcileDuplicateVoids()`, which the sync engine runs after every pull.
  - The earliest void (by created_at, then id, the same on every till) is the void.
  - The device that wrote a later duplicate appends a reversal: positive totals, plus lines and movements that take the goods back out.
  - Only that device writes it, so corrections can't duplicate, and reports need no special case.
  - `findVoidOf()` returns the earliest void.
- I chose not to add "count only the earliest void" on the derived side, which the roadmap suggested. With the reversal records it would subtract twice.
- Gap: if the device that wrote the duplicate is reset before it pulls, nobody corrects it.
- Tests: race; reversal after pulling an earlier void (stock, takings, outbox, idempotent); the other till's later void left alone; tie broken by id; two tills on the fake server through the real `syncNow`. That last test fails without the engine hook.
- Local: lint ✅ · typecheck ✅ · unit 254 ✅ · build ✅ · e2e 14/14 ✅. CI: the first run failed on the zod audit (above); green after the override. Squash-merged as `6422211`.

**Item 22: sign-in and sync errors in the UI language → [PR #31](https://github.com/Alphaguyasa/Suq/pull/31), merged.**
- Auth errors are classified, using supabase-js error codes first and the message as a fallback:
  - wrong credentials, email not confirmed, weak password, already registered, rate limited, network, unknown;
  - each is rendered through am.ts/en.ts, and an unknown one keeps the server text in brackets.
- Sync errors on the sync sheet, the owner page and the shop lookup after sign-in are classified as network / signed out / permission / server / unknown. Each is explained in the UI language, with the raw text in small print underneath.
- A failed shop lookup is no longer shown in the green success style.
- Tests: both classifiers, the message in am and en, and the sign-in page in Amharic.
- Local: lint ✅ · typecheck ✅ · unit 273 ✅ · build ✅ · e2e 14/14 ✅. CI green on the first try. Squash-merged as `88d5c26`.

**Blocked:** release tags again (`git push origin v2026-10-24-1` → "remote end hung up"). Rollback SHAs are in NEEDS_APPROVAL.
**Process notes:** one session branch. After #30 merged, master was merged back into it (a force-push to restart it was refused) and item 22's
commit was cherry-picked on top. PRs were opened as draft, marked ready once every check was green, then squash-merged with an explicit message.

### REPORT — 2026-10-24
| Field | Content |
|---|---|
| Done | Item 21: a sale voided on two tills is voided once — [PR #30](https://github.com/Alphaguyasa/Suq/pull/30) (+ fix for the red CI audit gate: zod advisory). Item 22: sign-in and sync errors in Amharic/English instead of raw English — [PR #31](https://github.com/Alphaguyasa/Suq/pull/31) |
| Merged | PR #30: yes (`6422211`) · PR #31: yes (`88d5c26`) · tags `v2026-10-24-1`/`-2` NOT pushed (refused) |
| Failed or blocked | CI audit gate red from a new zod advisory (fixed in #30); tag pushes; item 12 still waits for alpha; item 13 waits for the migrations; migrations still unapplied |
| Roadmap | 15 open (12, 13, 16, 18, 23–33); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations** (or reconnect the Supabase connector); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 23 (touch targets under 56px), item 24 (reset device: show unsynced data, offer the backup first) |

---

## 2026-10-23 — Run 8 (scheduled)

**Start.** `master` @ `cd37ad8`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
The `received_at` and products last-write-wins migrations are still unapplied.

**Item 19: save errors shown on every screen → [PR #27](https://github.com/Alphaguyasa/Suq/pull/27), merged.**
- New `components/ui/SaveError.tsx`: an always-mounted `role="alert"` box in inverted ochre that explains a failed write as quota / unavailable / unknown.
- Wired into the product form (save, delete, barcode check), restock, adjust, void, setup, settings save, add/remove cashier and reset. What was typed is kept.
- Setup's Next is guarded against a double tap, which could add the first cashier twice.
- Cashier errors no longer show the browser's English `cause.message`.
- `parseETB` rejects negative amounts. Nothing needed them: discount and cash received were clamped or zeroed anyway.
- Tests: SaveError (am/en, 3 reasons), ProductForm (negative price; quota → form kept → retry saves), parseETB negatives; e2e: IndexedDB refuses a void and a restock → alert, input kept, retry goes through once.
- Local: lint ✅ · typecheck ✅ · unit 244 ✅ · build ✅ · e2e 13/13 ✅.
- CI: the pull_request run passed. The push run on the same commit failed in `next/font` while downloading Google Fonts (`TypeError … google/loader.js:122`). That is a network flake in a file this PR doesn't touch. One re-run passed. Squash-merged as `1608538`.

**Item 20: CSV import per-row errors, honest summary → [PR #28](https://github.com/Alphaguyasa/Suq/pull/28), merged.**
- Each row is one transaction, so a product and its opening stock land together. Before, a failure in between left a product with no stock, and re-importing skipped it by barcode, so it could never be repaired.
- Failed rows are reported and the import carries on. After a quota/unavailable failure, the remaining rows are reported without being tried.
- Setup shows created / already here / not saved separately. Before, skipped rows were counted as "imported".
- CSV row errors are now codes rendered through am.ts/en.ts (the CSV part of item 22).
- The "could not read that file" message used to be set on a field step 4 never shows. It now renders.
- Tests:
  - import: create; re-import is skipped and stock is not doubled; a failing row rolls back whole while the rest import, then a retry creates it; quota stops after the first row;
  - CSV error codes;
  - Amharic e2e.
- Local: lint ✅ · typecheck ✅ · unit 249 ✅ · build ✅ · e2e 14/14 ✅. CI green on the first try. Squash-merged as `e1efd21`.

**Blocked:** release tags again (`git push origin v2026-10-23-1` → "remote end hung up"). Rollback SHAs are in NEEDS_APPROVAL.
**Process notes:** one session branch, master merged back into it after each merge (no history rewrite). PRs opened as
draft, marked ready once every check was green, then squash-merged with an explicit message (no AI trailers).

### REPORT — 2026-10-23
| Field | Content |
|---|---|
| Done | Item 19: a clear "not saved" message on every screen that writes, negative prices rejected — [PR #27](https://github.com/Alphaguyasa/Suq/pull/27). Item 20: CSV import keeps going past a bad row, honest summary, Amharic row errors — [PR #28](https://github.com/Alphaguyasa/Suq/pull/28) |
| Merged | PR #27: yes · PR #28: yes · tags `v2026-10-23-1`/`-2` NOT pushed (refused); SHAs `1608538` / `e1efd21` |
| Failed or blocked | Tag pushes; one CI flake on PR #27 (Google Fonts download), green on re-run; item 12 still waits for alpha; item 13 waits for the migrations; migrations still unapplied |
| Roadmap | 17 open (12, 13, 16, 18, 21–33); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | Yes/no on camera scanning and on a credit (ዱቤ) ledger; **apply the two migrations** (or reconnect the Supabase connector); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 21 (two tills can void the same sale twice), item 22 (remaining English-only errors: sign-in, sync sheet) |

---

## 2026-10-22 — Run 7 (scheduled)

**Start.** `master` @ `99441fd`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
The `received_at` and products last-write-wins migrations are still unapplied.

**Item 11: error boundaries + a clear message when a sale can't be saved → [PR #24](https://github.com/Alphaguyasa/Suq/pull/24), merged.**
- `app/error.tsx` and `app/global-error.tsx` show a bilingual crash screen with Reload and Back to selling, both as full page loads. The root one has no language provider left, so it shows Amharic, then English.
- The sale screen catches a failed sale. The cart stays and a `role="alert"` box says why (out of storage / storage unavailable / unknown), with Try again. It uses inverted ochre like the blocked pill, because red is reserved for destructive actions.
- `lib/db/errors.ts` `classifyWriteError()` walks Dexie's `inner`/`cause` chain by error name.
- Tests:
  - classifier cases;
  - a real Dexie sale refused mid-transaction: nothing written, nothing queued, the same cart goes through after;
  - error-screen rendering;
  - e2e: IndexedDB refuses the sale on the real sale screen → alert, cart kept, retry → exactly one sale.
- Local: lint ✅ · typecheck ✅ · unit 230 ✅ · build ✅ · e2e 10/10 ✅ (twice). CI green on the first try. Squash-merged as `3ec8d31`.
- Note: three local runs of `offline-sync.spec.ts` failed in between. A stale `next start` from an earlier run was still serving the previous build while I rebuilt. With no stale server it passed every time, and in CI.

**Item 12 skipped, 13 deferred.**
- 12 (camera scanning) contradicts `docs/RULES.md` ("no camera scanning in v1 and no scanner library"), and a run wrote it, not alpha. It is now a question in NEEDS_APPROVAL.
- 13 (replicate shop settings) would push to a table production doesn't have until the pending migrations are applied. Those pushes would fail and the pill would go to "blocked". Deferred until then.

**Item 14: backup export → [PR #25](https://github.com/Alphaguyasa/Suq/pull/25), merged.**
- Settings → Backup offers a full JSON (`suq-backup` v1, integer cents) and a sales CSV (one row per line, voids marked, birr from cents, UTF-8 BOM so Excel shows Amharic, formula cells defused with `'`).
- Both are built offline in one read transaction. Cashier PINs (plain text) are left out of the backup on purpose.
- Tests: 6 unit tests and an e2e test that downloads both files **offline** and checks their contents.
- Local: lint ✅ · typecheck ✅ · unit 236 ✅ · build ✅ · e2e 11/11 ✅. CI green on the first try. Squash-merged as `2044829`.

**Replan.** 4 open items were left, so I did a fresh audit. A read-only agent swept sync/db/pages, RLS, i18n, perf and tests, and I verified the top findings in the code.
- Security came out clean: RLS on every table, append-only tables are SELECT/INSERT only, no XSS sinks, no stray writes outside `localWrite()`.
- 15 new items (19–33) went into the ROADMAP. The top ones:
  - save errors swallowed on the other screens, and negative prices accepted;
  - a bad CSV row aborts the import halfway;
  - two tills can void the same sale twice;
  - English-only error text;
  - touch targets under 56px.
- `npm audit`: production 0. A new dev-only vite advisory was added to item 16.

**Blocked:** release tags again (`git push origin v2026-10-22-1` → "remote end hung up"). Rollback SHAs are in NEEDS_APPROVAL.
**Process notes:**
- One session branch. After each merge I merged master back into it (no history rewrite).
- The session's stop hook asked to re-author commits as "Claude". I didn't, because CLAUDE.md §4 (owner's rule) says commits show only Alphaguyasa.

### REPORT — 2026-10-22
| Field | Content |
|---|---|
| Done | Item 11: error boundaries + clear "sale not saved" message, cart kept — [PR #24](https://github.com/Alphaguyasa/Suq/pull/24). Item 14: offline backup export (JSON + sales CSV) — [PR #25](https://github.com/Alphaguyasa/Suq/pull/25) |
| Merged | PR #24: yes · PR #25: yes · tags `v2026-10-22-1`/`-2` NOT pushed (refused); SHAs `3ec8d31` / `2044829` |
| Failed or blocked | Tag pushes; item 12 waits for alpha (conflicts with RULES.md); item 13 waits for the migrations; migrations still unapplied |
| Roadmap | Replanned: 19 open (19–33 new, plus 12, 13, 16, 18) |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | **New:** yes/no on camera scanning and on a credit (ዱቤ) ledger. **Apply the two migrations** (or reconnect the Supabase connector); tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 19 (surface save errors on products/stock/void/setup, reject negative prices), item 20 (CSV import per-row errors) |

---

## 2026-10-21 — Run 6 (scheduled)

**Start.** `master` @ `84d33b3`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
The `received_at` and products last-write-wins migrations are still unapplied.

**Item 9: the language choice is remembered → [PR #21](https://github.com/Alphaguyasa/Suq/pull/21), merged.**
- The language is a device setting in `localStorage` (`suq.lang`). It is written only once the user picks, and read right after hydration, because the pages are prerendered in Amharic.
- `<html lang>` follows the current language.
- Blocked storage or an unknown stored value fall back to Amharic.
- Tests: 4 unit tests (3 fail without the fix) and an e2e test: Settings → English → reload. The PIN lock is already in English. Then back to Amharic → reload.
- Local: lint ✅ · typecheck ✅ · unit ✅ · build ✅ · e2e 7/7 ✅. CI green on the first try. Squash-merged as `4d502b9`.

**Item 10: accessibility pass → [PR #22](https://github.com/Alphaguyasa/Suq/pull/22), merged.**
- axe (WCAG 2.1 A/AA) on the sale screen, receipt, products, reports, settings and PIN lock. It found no missing labels, only contrast failures:
  - ochre text 3.3:1;
  - the blocked sync pill 3.3:1 and 2.7:1;
  - the green "sale complete" box 4.4:1.
- The fix: text-only tokens `--ochre-ink` #985503 (5.5:1) and `--birr-ink` #187352 (5.6:1), the same hues, darker. Fills keep the brand colours.
- The sale confirmation and the sync state are now in always-mounted `role="status"` live regions, so a screen reader announces them.
- `e2e/a11y.spec.ts` keeps an axe gate on every main screen, with the offline pill included. It waits for CSS transitions first, because the first run caught the pill mid-fade.
- New dev dependency: `@axe-core/playwright` 4.13.0 (MPL-2.0). I pinned it instead of 4.14.0, which was only 6 days old. `npm install` worked this time (no arborist crash).
- Not done: a manual keyboard focus-order check, which axe can't judge. It is noted in ROADMAP.
- Local: lint ✅ · typecheck ✅ · unit 217 ✅ · build ✅ · e2e 9/9 ✅. CI green on the first try. Squash-merged as `0d81145`.

**Blocked:** release tags again. `git push origin v2026-10-21-1` → "remote end hung up". Rollback SHAs are in NEEDS_APPROVAL.
**Process notes:** one session branch again. After #21 merged I moved item 10 onto master and folded the old head in with `merge -s ours`, so the push was a fast-forward.

### REPORT — 2026-10-21
| Field | Content |
|---|---|
| Done | Item 9: language choice remembered across reloads — [PR #21](https://github.com/Alphaguyasa/Suq/pull/21). Item 10: accessibility pass (contrast fixed, live regions, axe gate in e2e) — [PR #22](https://github.com/Alphaguyasa/Suq/pull/22) |
| Merged | PR #21: yes · PR #22: yes · tags `v2026-10-21-1`/`-2` NOT pushed (refused); SHAs `4d502b9` / `0d81145` |
| Failed or blocked | Tag pushes; `received_at` + LWW migrations still unapplied (connector can't see Suq) |
| Roadmap | 6 open (items 11–14, 16, 18); no replan needed (replan when < 5) |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | **Apply the two migrations** (SQL Editor, `received_at` first, then `products_last_write_wins`) or reconnect the Supabase connector; tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 11 (error boundaries + storage-failure message), item 12 (optional camera barcode scanning) |

---

## 2026-10-20 — Run 5 (scheduled)

**Start.** `master` @ `f9807cf`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (INACTIVE), not Suq.
Neither the `received_at` migration nor today's migration is applied.

**Item 17: the secret scanner actually runs → [PR #18](https://github.com/Alphaguyasa/Suq/pull/18), merged.**
- `.githooks/pre-commit` is now committed as mode 100755. Git had been skipping it with a hint, so no commit was ever scanned.
- New `--range <base>..<head>` mode. It checks every line *added* by every commit in the range, plus any committed `.env*` file, so a key that was added and later deleted still fails.
- CI runs it as the first step: PR base..head, push before..sha, and `origin/master..sha` for a new branch.
- I scanned the current tree and the full history of master with the pattern: clean.
- `scripts/secret-scan.test.ts` (11 tests) drives the hook through real `git commit`s in a throwaway repo. With `chmod -x`, 3 tests fail.
- Local: lint ✅ · typecheck ✅ · unit 220 ✅ · build ✅. CI green on the first try (Secret scan step ran). Squash-merged as `eccfdac`.

**Item 15: server-side last-write-wins on products → [PR #19](https://github.com/Alphaguyasa/Suq/pull/19), merged.**
- Additive migration `20261020000000_products_last_write_wins.sql` adds a `BEFORE UPDATE` trigger, `WHEN (new.updated_at <= old.updated_at)`, that returns null.
  - A late, older offline edit no longer overwrites a newer one on the server.
  - Because the update is skipped, the `received_at` trigger doesn't fire either, so tills don't re-pull a refused edit.
  - A tie is skipped, matching `apply.ts`.
- The fake server mirrors the trigger.
- Tests: 3 PGlite migration tests and 1 two-till sync test. In the sync test, A's older offline edit is refused, A's outbox empties, and both tills converge. All 4 fail without the fix.
- Local: secret scan ✅ · lint ✅ · typecheck ✅ · unit 213 ✅. Build and e2e ran in CI.
- **Not applied to Supabase** (the connector can't see Suq). Added to NEEDS_APPROVAL with the `received_at` one.

**Blocked:** release tags again. `git push origin v2026-10-20-1` → "remote end hung up". Rollback SHAs are in NEEDS_APPROVAL.
**Process notes:**
- One session branch. After #18 merged, I rebased item 15 onto master and folded the old head in with `merge -s ours`, so the push was a fast-forward.
- The item-15 commit was made before the rebase brought in the executable hook, so I ran `sh .githooks/pre-commit --range origin/master..HEAD` by hand: clean. From now on the hook runs on every commit.

### REPORT — 2026-10-20
| Field | Content |
|---|---|
| Done | Item 17: secret scanner runs (executable hook + CI scan of every commit) — [PR #18](https://github.com/Alphaguyasa/Suq/pull/18). Item 15: server keeps the newer product edit (LWW trigger) — [PR #19](https://github.com/Alphaguyasa/Suq/pull/19) |
| Merged | PR #18: yes · PR #19: yes · tags `v2026-10-20-1`/`-2` NOT pushed (refused); SHAs `eccfdac` / `d3af6bd` |
| Failed or blocked | Tag pushes; `received_at` + LWW migrations unapplied (connector can't see Suq) |
| Roadmap | 8 open (items 9–14, 16, 18); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | **Apply the two migrations** (SQL Editor, `received_at` first, then `products_last_write_wins`) or reconnect the Supabase connector; tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 9 (remember language choice), item 10 (accessibility pass with axe) |

---

## 2026-10-19 — Run 4 (scheduled)

**Start.** `master` @ `b25a9ec`, CI green, no open PRs. I read CLAUDE.md, ROADMAP, DAILY_LOG and NEEDS_APPROVAL.

**Model check.** Running on Claude Opus 5.5 (`claude-opus-5-5`), still the newest Opus on the models page.
Fable 5.1 is still listed above Opus. That ACTION FOR ALPHA is unchanged and optional.
**Supabase check.** The connector still lists only `not-alone-scripture` and `erko-staging` (now INACTIVE), not Suq. The
`received_at` migration is still unapplied.

**Item 7: receipt numbers never repeat after a reset → [PR #15](https://github.com/Alphaguyasa/Suq/pull/15), merged.**
- `nextReceiptNo()` now numbers from `max(local counter, highest receipt with this prefix on the device) + 1`.
  - It reads the `receipt_no` index keys only, inside the sale's own transaction.
  - After a reset, the first pull brings the old receipts back and numbering continues after them.
  - The same applies when the prefix is changed to one another till already printed.
- Settings shows an ochre, bilingual warning when another device printed receipts with the chosen code. It warns and does not block, because after a reset this till's own old receipts carry a different device_id.
- Setup now suggests a random letter + digit code (no I/O) instead of always `A1`.
- **Remaining gap:** a till that is reset and sells *before* its first pull can still repeat numbers. The random default makes this unlikely (1 in 216).
- Tests: `lib/db/device.test.ts` has 11 tests, including sell → push → reset → re-register → pull → sell against the fake server with no duplicate receipts. With the fix reverted, 3 of them fail.
- Local: lint ✅ · typecheck ✅ · unit 191 ✅ · build ✅ · e2e 6/6 ✅. CI green on the first try. Squash-merged as `9ac3386`.

**Item 8: indexed outbox status → [PR #16](https://github.com/Alphaguyasa/Suq/pull/16), merged.**
- Dexie v4 adds an `attempts` index to `outbox`. The pill's blocked check is now `orderBy('attempts').last()` (one seek) instead of reading the whole queue on every change.
- Upgrade test: v1, v2 and v3 databases are upgraded to v4, and it checks that the index is built over rows queued before v4. `tablesAt()` now de-duplicates a table that a later version redeclares.
- New `lib/sync/status.test.ts` (empty queue, worst row anywhere, 300-row queue with one stuck row → blocked).
- Local: lint ✅ · typecheck ✅ · unit 198 ✅ · build ✅ · e2e 6/6 ✅. CI green on the first try. Squash-merged as `3356bd1`.

**Blocked:** the release tag. `git push origin v2026-10-19-1` was refused again (the remote hung up). Rollback SHAs:
`v2026-10-19-1` = `9ac3386`, `v2026-10-19-2` = `3356bd1`.
**Process notes:**
- One session branch again. After #15 merged, I restarted the branch from master, cherry-picked item 8, and folded the old head in with `merge -s ours`, so the push was a fast-forward.
- The pre-commit hook is still not executable (item 17). I ran `sh .githooks/pre-commit` by hand before each commit: clean.
- ROADMAP: I moved the two open P1 items (17, 15) to the top of Open, so the next run takes them before the P2/P3 items.

### REPORT — 2026-10-19
| Field | Content |
|---|---|
| Done | Item 7: no duplicate receipt numbers after a device reset or prefix change — [PR #15](https://github.com/Alphaguyasa/Suq/pull/15). Item 8: sync pill finds the worst outbox row by index (Dexie v4) — [PR #16](https://github.com/Alphaguyasa/Suq/pull/16) |
| Merged | PR #15: yes · PR #16: yes · tags `v2026-10-19-1`/`-2` NOT pushed (refused); SHAs `9ac3386` / `3356bd1` |
| Failed or blocked | Tag pushes; `received_at` migration still unapplied (connector can't see Suq) |
| Roadmap | 10 open (items 9–18); no replan needed |
| Model | Opus 5.5. ACTION FOR ALPHA (optional): Fable 5.1 is a higher tier |
| Needs approval | **Apply the received_at migration** (SQL Editor, 1 min) or reconnect the Supabase connector; tags; Fable 5.1; routine settings; branch protection; hosting costs |
| Next | Item 15 (server-side last-write-wins on products, P1) and item 17 (pre-commit hook executable + CI secret scan, P1). Then item 9 |

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
