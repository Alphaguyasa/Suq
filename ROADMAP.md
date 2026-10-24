# ROADMAP — Suq

Prioritized backlog. The daily run takes the **top open item**. Priority: **P0** = broken/insecure/rule
violation, **P1** = real user or demo impact, **P2** = quality/UX/perf, **P3** = new feature / nice to have.
Effort: **S** < 2h, **M** half a day, **L** a day or more (split L items into smaller PRs).

When an item merges, move it to **Done** with its PR link and release tag. When fewer than 5 items are open,
REPLAN (see CLAUDE.md §6).

Built from the Phase 0 audit on 2026-10-14 (full read of the codebase, docs, `npm audit`, a production build,
and the unit test suite).

## Open

Next run: take the highest-priority open item (P1 before P2), skipping anything marked WAITING or
"after the pending migrations". As of 2026-10-24 that is item 23, then 24.

### 12. [P3 · M] Optional camera barcode scanning — WAITING FOR ALPHA (see NEEDS_APPROVAL)
`docs/RULES.md` says "no camera scanning in v1 and no scanner library", and this item was written by a run, not
approved by alpha. Not started until alpha decides. If yes: prefer the browser's built-in `BarcodeDetector`
(Chrome on Android has it, no dependency), with @zxing/browser only as an optional fallback.

Many shops have no USB scanner. Add a camera scan button on the sale screen and product form, lazily loaded
(dynamic import, so it never weighs on the till's first load), behind feature detection. Works offline.
(Note: `docs/RULES.md` lists camera scanning as not in v1; this item is the explicit decision to add it as
optional. MIT-licensed, Apache-2.0 for zxing core.)

### 13. [P3 · M] Replicate shop settings so the owner dashboard shows the shop name — after the pending migrations are applied
Do not ship before the Supabase migrations in NEEDS_APPROVAL are applied: tills would push to a table that does not
exist in production yet, every push of it would fail and the sync pill would go to "blocked".
`shop_settings` is local-only; the owner view on a second device cannot show which shop it is looking at.
Additive migration (new table, RLS like the others) + LWW sync like `products`. Migration file + test.

### 16. [P2 · S] Dev-tooling advisories (vitest, undici via jsdom, braces via eslint-config-next, vite)
2026-10-22: `npm audit` also lists vite 8.2.0–8.2.2 (high, dev only). Production: 0 advisories.
`npm audit` (dev included) still reports high/moderate advisories in test/lint tooling only — nothing that
ships to a till. `npm install` currently crashes in npm 10's arborist (`Cannot read properties of null
(reading 'edgesOut')`, peer-set resolution of vitest's optional `jsdom` peer) when bumping vitest to 4.1.11
or overriding undici ≥ 8.10.2. Retry with a newer npm or by regenerating the lockfile; `braces` has no fixed
release yet (every version affected) — wait for upstream.

### 18. [P2 · S] Harden the older offline e2e tests against service-worker network leaks
Found while doing item 5: in Chromium, `context.setOffline(true)` does not stop requests the service
worker makes itself, so a page missing from the precache can still load "offline" in a test.
`e2e/offline-detail-pages.spec.ts` also blocks the app origin with `context.route` (`goOffline()`); move that
helper into `e2e/helpers.ts` and use it in `offline-launch.spec.ts` and `offline-sync.spec.ts` (keep the
fake Supabase routes working), so those tests prove what they claim.

## Replan 2026-10-22 (audit: sync/db/pages, RLS, i18n, perf, tests, features)
RLS is on for every table, append-only tables allow only SELECT/INSERT, no XSS sinks, and the only writes outside
`localWrite()` are the sanctioned `lib/sync/apply.ts` and the dev-only demo seed. Items below are ordered by priority.

### 23. [P1 · S] Touch targets under 56px
Quick-cash buttons in `components/sell/PaymentPanel.tsx` (`px-3 py-2 text-xs`, ~34px) and the back links on
`/sales/view` and `/products/stock`. Fix: `min-h-touch`; add a size check to the axe e2e.

### 24. [P2 · S] Reset device: show what is not synced yet, offer the backup first
`lib/db/reset.ts` clears everything; Settings only asks for the shop name. Show the outbox count and, when it is
above 0, put the (new) backup download right there and say plainly what will be lost.

### 25. [P2 · M] Sale screen re-reads every stock movement after each write
`stockRepo.onHandAll()` iterates the whole `stock_movements` table on every change; `stock_cache` is maintained but
never read, and pulled movements don't refresh it. `recentProductIds` makes ~40 sequential queries. Fix: read
`stock_cache` (refresh it in `apply.ts` for touched products), one `anyOf` query for recents. Keep stock derived.

### 26. [P2 · M] Reports and sales history read whole tables
`app/reports/page.tsx` loads all sales and sale lines to show one period; `app/sales/page.tsx` renders every sale.
After a year of trading that is seconds on a cheap phone. Fix: `created_at` index range queries; paginate history.

### 27. [P2 · S] Gross profit uses today's cost, not the cost at the time of sale
`lib/reports/compute.ts` says so in a comment. Fix: `cost_snapshot` on `sale_items` (Dexie v5 + upgrade test,
additive nullable column migration); old lines fall back to current cost.

### 28. [P2 · M] Test gaps
No tests for `recentProductIds`, `adoptShopFromMembership`, `lib/reports/period.ts`, the `MissingColumnError`
legacy pull fallback, and the adjust/setup/settings UI error paths (`importProducts`, void and restock are covered
since PRs #27/#28). Also check (unverified) that a
scanner typing a code + Enter cannot add the item twice (`handleTermChange` and `handleSearchKeyDown` both look up).

### 29. [P2 · S] Owner page polls Supabase every 15s even when hidden
`app/owner/page.tsx`. Pause on `visibilitychange`; saves battery and the free-tier quota.

### 30. [P3 · M] Saved end-of-day close
The cash-up sheet exists but float and counted cash live only in React state; nothing is recorded, so past
shortfalls are invisible. Append-only `cash_closes` record (local first; sync after the migrations are applied).

### 31. [P3 · S] Share a receipt as text (Web Share / Telegram)
For shops without a thermal printer; today only `window.print()`. Bilingual, offline-capable via `navigator.share`.

### 32. [P3 · M] Owner PIN for voids, price edits and reset
Any cashier PIN can void, change prices or reset the device. Add an owner role for those actions. (PINs are plain
text by design — `lib/db/cashiers.ts` explains why; revisit only together with this item.)

### 33. [P3 · L] Credit (ዱቤ) customer ledger — WAITING FOR ALPHA
`credit` is already a payment method but records no customer. `docs/RULES.md` lists customer credit accounts as out
of scope for v1, so this needs alpha's decision (see NEEDS_APPROVAL).

## Done

- **Sign-in and sync errors in the UI language (item 22)** — auth errors classified (supabase-js error codes first,
  message as fallback: wrong credentials / email not confirmed / weak password / already registered / rate limited /
  network / unknown) and rendered through am.ts/en.ts; sync errors (sync sheet, owner page, shop lookup after
  sign-in) classified as network / signed out / permission / server / unknown, explained in the UI language with the
  raw text in small print underneath. Unit tests incl. the sign-in page in Amharic.
  [PR #31](https://github.com/Alphaguyasa/Suq/pull/31) · tag `v2026-10-24-2` not pushed (refused) — commit `88d5c26`

- **A sale voided on two tills is voided once (item 21)** — the already-voided check runs inside the write
  transaction; after every pull `reconcileDuplicateVoids()` lets the device that wrote a later duplicate void append
  a reversal of it (earliest void by created_at, then id, is the void on every till), so sums, stock and the server
  agree again with no special case in reports. Two-till fake-server test through the real sync engine. Same PR:
  `zod` overridden to ^4.6.6 (GHSA-mrhx-c7xc-m3w5, high, pinned by @serwist/next) — the CI audit gate was red.
  Gap: a duplicate whose device is reset before its next pull stays uncorrected.
  [PR #30](https://github.com/Alphaguyasa/Suq/pull/30) · tag `v2026-10-24-1` not pushed (refused) — commit `6422211`

- **CSV import: per-row errors, honest summary (item 20)** — each row is one transaction (product + opening stock
  together, so a failed row leaves nothing a re-import would skip); failed rows reported, the rest carry on, and
  after a quota/unavailable failure the remaining rows are reported untried. Setup shows created / already here /
  not saved; CSV row errors are codes rendered through am.ts/en.ts (the CSV part of item 22); the unreadable-file
  message now renders. Unit + Amharic e2e.
  [PR #28](https://github.com/Alphaguyasa/Suq/pull/28) · tag `v2026-10-23-2` not pushed (refused) — commit `e1efd21`

- **Save errors shown on every screen (item 19)** — `components/ui/SaveError.tsx` (bilingual quota / unavailable /
  unknown via `classifyWriteError()`) on the product form (save, delete, barcode check), restock, adjust, void,
  setup (plus a double-tap guard), settings save, add/remove cashier and reset; what was typed is kept. Cashier
  errors no longer show the browser's English message. `parseETB` rejects negative amounts. Unit + e2e (refused
  void and restock, then retry). [PR #27](https://github.com/Alphaguyasa/Suq/pull/27) · tag `v2026-10-23-1` not pushed (refused) — commit `1608538`

- **Backup export (item 14)** — Settings → Backup: full JSON (products, sales, lines, movements, shop details;
  integer cents; `suq-backup` v1) and a sales CSV (one row per line, voids marked, birr from cents, UTF-8 BOM for
  Excel, formula cells defused), built offline in one read transaction. Cashier PINs left out. Unit + offline e2e.
  [PR #25](https://github.com/Alphaguyasa/Suq/pull/25) · tag `v2026-10-22-2` not pushed (refused) — commit `2044829`

- **Error boundaries + sale-save failure (item 11)** — `app/error.tsx` / `app/global-error.tsx` bilingual crash
  screen (Reload, Back to selling). A sale IndexedDB refuses keeps the cart and says why (out of storage /
  unavailable / unknown) with Try again; `classifyWriteError()` reads Dexie's inner/cause chain. Unit tests incl. a
  real Dexie quota abort (nothing written) + e2e on the sale screen. Other screens: item 19.
  [PR #24](https://github.com/Alphaguyasa/Suq/pull/24) · tag `v2026-10-22-1` not pushed (refused) — commit `3ec8d31`

- **Accessibility pass on the till (item 10)** — axe (WCAG 2.1 A/AA) on the sale screen (empty, cart, sale complete,
  offline), receipt, products, reports, settings and the PIN lock. No missing labels; it found contrast only: ochre
  text 3.3:1, the blocked pill 3.3:1 / 2.7:1, green confirmation 4.4:1. New text tokens `--ochre-ink` (#985503,
  5.5:1) and `--birr-ink` (#187352, 5.6:1), same hues darker; fills unchanged. Always-mounted `role="status"` live
  regions for the sale confirmation and the sync state. `e2e/a11y.spec.ts` keeps the axe gate. Not covered by axe:
  keyboard focus order (manual check still to do). [PR #22](https://github.com/Alphaguyasa/Suq/pull/22) · tag `v2026-10-21-2` not pushed (refused) — commit `0d81145`

- **Language choice remembered (item 9)** — the picked language is a device setting in `localStorage`
  (`suq.lang`), written only once the user chooses, applied right after hydration, and `<html lang>` follows it.
  Blocked storage or a garbage value fall back to Amharic. Unit tests (round-trip, garbage, blocked storage) +
  e2e (Settings → English → reload: the PIN lock is already English → back to Amharic → reload).
  [PR #21](https://github.com/Alphaguyasa/Suq/pull/21) · tag `v2026-10-21-1` not pushed (refused) — commit `4d502b9`

- **Server-side last-write-wins on products (item 15)** — additive migration `20261020000000_products_last_write_wins.sql`:
  a BEFORE UPDATE trigger skips a product update whose `updated_at` is not newer (so a late offline edit no longer
  overwrites a newer one, and a refused edit is not re-stamped `received_at`). Fake server mirrors it; PGlite + two-till
  sync tests. **Migration still to be applied to the Suq project** (see NEEDS_APPROVAL).
  [PR #19](https://github.com/Alphaguyasa/Suq/pull/19) · tag `v2026-10-20-2` not pushed (refused) — commit `d3af6bd`

- **Secret scanner actually runs (item 17)** — `.githooks/pre-commit` committed executable (git had been skipping it);
  new `--range` mode scans every line added by every commit; CI runs it on every PR and push (a key added then
  deleted still fails). `scripts/secret-scan.test.ts` drives it through real commits.
  [PR #18](https://github.com/Alphaguyasa/Suq/pull/18) · tag `v2026-10-20-1` not pushed (refused) — commit `eccfdac`

- **Indexed outbox status (item 8)** — Dexie v4 indexes `outbox.attempts`; the sync pill's blocked check is one
  seek (`orderBy('attempts').last()`) instead of reading the whole queue on every change. Upgrade test covers
  v1–v3 → v4 and checks the new index over old rows. [PR #16](https://github.com/Alphaguyasa/Suq/pull/16) · tag `v2026-10-19-2` not pushed (refused) — commit `3356bd1`

- **No duplicate receipt numbers after reset (item 7)** — `nextReceiptNo()` continues past the highest local
  receipt with the device's prefix (own or pulled), so a reset till resumes after its first pull; Settings warns
  when another device printed receipts with the chosen code; setup suggests a random code instead of `A1`.
  Remaining gap: a reset till that sells before its first pull (unlikely with the random default).
  [PR #15](https://github.com/Alphaguyasa/Suq/pull/15) · tag `v2026-10-19-1` not pushed (refused) — commit `9ac3386`

- **Dexie upgrade survival tests (item 6)** — schema versions in an append-only `SCHEMA_VERSIONS` list;
  `openAtVersion()` helper; `lib/db/upgrade.test.ts` fills a database at every historical version, upgrades it,
  and checks rows, receipt counter, indexes, new tables and the outbox sequence; it freezes published versions
  and requires a fixture per table. [PR #13](https://github.com/Alphaguyasa/Suq/pull/13) · tag `v2026-10-18-2` not pushed (refused) — commit `7e19f07`

- **Receipts and products open offline (item 5)** — `/sales/view`, `/products/edit`, `/products/stock` static
  shells reading `?id=`, precached, served by a SW navigation rule whatever the query; old paths redirect.
  Unlocked cashier remembered per tab (sessionStorage, idle timeout kept) so an offline full-page navigation
  doesn't ask for the PIN again. e2e: offline sale → receipt → void; product → stock → restock.
  [PR #12](https://github.com/Alphaguyasa/Suq/pull/12) · tag `v2026-10-18-1` not pushed (refused) — commit `204fb5f`

- **Persistent storage (item 4)** — `lib/storage/persist.ts`: `navigator.storage.persist()` requested once on
  first run (after the device row exists), outcome + time recorded on `device_meta`; Settings shows the live
  state (granted / not granted / not supported) with a bilingual explanation and an "ask again" button.
  Unit tests (granted, denied, unsupported, already persisted, throws) + e2e. [PR #10](https://github.com/Alphaguyasa/Suq/pull/10) · tag `v2026-10-16-2` not pushed (403) — commit `943f9f0`

- **Pull watermark in the server's clock (item 3)** — additive migration `20261016000000_received_at.sql`:
  `received_at` on all four synced tables, stamped by a trigger with `clock_timestamp()` (client value
  ignored), `(shop_id, received_at, id)` indexes, existing rows read as received at migration time. Pull
  filters on `received_at` with a 2-minute overlap, strips it from local rows and pushes, re-reads from the
  beginning once on switching (recovers rows already lost), and falls back to `created_at`/`updated_at` while
  the migration is not applied. Migration tested on real Postgres (PGlite). **Migration still to be applied
  to the Suq project** (see NEEDS_APPROVAL). [PR #9](https://github.com/Alphaguyasa/Suq/pull/9) · tag `v2026-10-16-1` not pushed (403) — commit `2c92d3b`

- **Pull pagination** — keyset pages of 500 on (watermark, id) until a short page; the watermark commits only
  after every page of every table landed; fake server enforces a 1000-row cap. Supabase `max_rows` must stay
  ≥ 500. [PR #4](https://github.com/Alphaguyasa/Suq/pull/4) · tag `v2026-10-15-2` not pushed (see NEEDS_APPROVAL) — commit `ad3de63`

- **Patch vulnerable production dependencies** — Next 15.5.22 → 15.5.28 (critical RCE + cache-poisoning
  advisories), `postcss` forced to ^8.5.30 via `overrides` (Next pins a vulnerable 8.4.31), sharp/nanoid/
  brace-expansion/source-map-js/browserslist bumped by `npm audit fix`; CI now fails on any new high/critical
  production advisory. [PR #3](https://github.com/Alphaguyasa/Suq/pull/3) · tag `v2026-10-15-1` not pushed (see NEEDS_APPROVAL) — commit `c75669a`

- **Project setup** — CLAUDE.md/ROADMAP/logs, ESLint, Playwright offline e2e + fake Supabase, CI; fixed offline
  cold launch (page HTML not precached) and shop adoption race on fresh devices. [PR #1](https://github.com/Alphaguyasa/Suq/pull/1) · `v2026-10-14-1`
