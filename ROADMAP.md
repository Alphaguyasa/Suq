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
"after the pending migrations". As of 2026-10-31 (run 18) that is item 40 (reset warning counts saved drawer counts),
then item 41 (moderate tooling advisories), then item 32 (owner PIN). Item 27 needs a new `sale_items` column that
production lacks until alpha applies the migrations, so it waits unless the push can leave the column out safely.

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
exist in production yet, every push of it would fail and the sync pill would go to "blocked". Replicate `cash_closes`
(item 30, local only today) in the same step: append-only table, RLS like `sales`.
`shop_settings` is local-only; the owner view on a second device cannot show which shop it is looking at.
Additive migration (new table, RLS like the others) + LWW sync like `products`. Migration file + test.

## Replan 2026-10-22 (audit: sync/db/pages, RLS, i18n, perf, tests, features)
RLS is on for every table, append-only tables allow only SELECT/INSERT, no XSS sinks, and the only writes outside
`localWrite()` are the sanctioned `lib/sync/apply.ts` and the dev-only demo seed. Items below are ordered by priority.

### 27. [P2 · S] Gross profit uses today's cost, not the cost at the time of sale
`lib/reports/compute.ts` says so in a comment. Fix: `cost_snapshot` on `sale_items` (Dexie v8 — v5/v6/v7 are taken by items 25, 34 and 30 — + upgrade test,
additive nullable column migration); old lines fall back to current cost.

### 32. [P3 · M] Owner PIN for voids, price edits and reset
Any cashier PIN can void, change prices or reset the device. Add an owner role for those actions. (PINs are plain
text by design — `lib/db/cashiers.ts` explains why; revisit only together with this item.)

### 33. [P3 · L] Credit (ዱቤ) customer ledger — WAITING FOR ALPHA
`credit` is already a payment method but records no customer. `docs/RULES.md` lists customer credit accounts as out
of scope for v1, so this needs alpha's decision (see NEEDS_APPROVAL).

## Replan 2026-10-29 (6 open, 4 of them waiting on alpha or the migrations)
Short audit: `npm audit` (dev included) is clean after PR #49, there are no TODO/FIXME markers, and `npm outdated`
shows patch/minor updates within the current majors. The lock state and the remaining gaps logged by earlier items
were read again.

## Replan 2026-10-31 (5 open, 4 of them blocked; short audit)
`npm audit` (dev included) now shows moderate advisories in build/lint tooling only; `npm audit --omit=dev` gate is
clean. `npm outdated` shows only majors: next 16, eslint 10, typescript 7, vitest 5, eslint-config-next 16.

### 40. [P2 · S] Reset warning counts saved drawer counts
`cash_closes` (item 30) is local only, so a reset destroys every saved count, but the danger section counts only the
outbox and may say "everything has reached the server". Count the closes in `unsyncedSummary()` (until item 13
replicates them) and say so; the backup button already includes them. Unit + e2e.

### 41. [P2 · S] Moderate advisories in build tooling (glob, minimatch)
GHSA-3g3m-2fjr-6pw4 (glob, via @serwist/build) and GHSA-g3hv-75wg-m249 (minimatch, via eslint). Build/lint time only,
never shipped to the till. Try `overrides` to patched versions within each dependent's range; `npm audit fix --force`
would downgrade @serwist/next and eslint, so not that. Lockfile with npm 11.

### 42. [P3 · L] Major upgrades, one PR each: vitest 5, typescript 7, eslint 10 (+ eslint-config-next), Next 16
Read each changelog first; Next 16 is last and largest (Serwist compatibility, App Router changes). Stop and log if
any needs code changes beyond an S.

## Done

- **Saved end-of-day close (item 30)** — Reports → cash-up "Save count" records float, cash sales, expected, counted and
  variance (cents) with the cashier and period in a new append-only, local-only `cash_closes` table (Dexie v7 +
  upgrade fixture). Saved counts are listed below, short in ochre; a recount is a second record; the same figures
  cannot be saved twice. Included in the JSON backup. Unit + offline e2e (survives a cold launch). Syncing waits for
  item 13. [PR #59](https://github.com/Alphaguyasa/Suq/pull/59) · tag `v2026-10-31-2` not pushed (refused) — commit `807465c`

- **Reset gaps closed (item 39)** — tests measured both gaps, and both were real. A reset now keeps the till's
  `device_id`, code and receipt counter in localStorage (`lib/db/previous-till.ts`), so a till set up again keeps
  numbering past its old receipts before any pull, and still reverses a duplicate void it wrote before the reset. A
  two-till test shows the gap with the identity forgotten (net short one sale, goods back twice).
  [PR #58](https://github.com/Alphaguyasa/Suq/pull/58) · tag `v2026-10-31-1` not pushed (refused) — commit `2616400`

- **Patch/minor dependency bumps (item 38)** — supabase-js 2.118, dexie 4.4.7, react/react-dom 19.3.1, jsdom 30.1.3,
  @vitejs/plugin-react 6.1.2, testing-library, types, @axe-core/playwright 4.14.0, pglite 0.5.13. Lockfile from npm 11
  (CLAUDE.md §3 says why). The newer axe found a real WCAG 2.5.3 gap: the sync pill's aria-label did not contain its
  visible text, so it is now named by its own text with an sr-only "Sync status:" prefix. New `SyncPill.test.tsx`.
  [PR #56](https://github.com/Alphaguyasa/Suq/pull/56) · tag `v2026-10-30-2` not pushed (refused) — commit `0d222b4`

- **Share the cash-up as text (item 37)** — a Share button next to Print on Reports sends the cash-up as plain text in
  the UI language (`lib/reports/cashup-text.ts`): net sales, transactions, takings per payment method, float, cash
  sales, expected, counted and short/over/balanced. `ShareReceiptButton` takes its own label and copied message.
  Unit + offline e2e. [PR #55](https://github.com/Alphaguyasa/Suq/pull/55) · tag `v2026-10-30-1` not pushed (refused) —
  commit `db7846b`

- **The PIN lock works from a keyboard, Tab order tested (item 36)** — a Tab walk found the sale screen's order already
  right (search → tiles → cart → payment → pay → nav). The PIN lock was not: picking a cashier dropped focus to
  `<body>`, a keyboard could not type the PIN, and ✕/← and the cart's −/+ had no usable names. Focus now goes to the
  PIN display, and digits/Backspace/Escape work (kept in a ref, so fast typing drops no digit). The first name has
  focus on a cold launch. New `e2e/keyboard.spec.ts` + LockScreen unit tests.
  [PR #53](https://github.com/Alphaguyasa/Suq/pull/53) · tag `v2026-10-29-4` not pushed (refused) — commit `fa520e5`

- **Setup unlocks the first cashier (item 35)** — setup now calls `unlockAs()` with the cashier it creates. The first
  full page load after setup (the offline "Sale complete" tap in the demo) no longer asks for the PIN, and those sales
  now record the cashier (they recorded none before). e2e `coldLaunch()` clears the tab's session for tests that
  mean a cold launch. [PR #52](https://github.com/Alphaguyasa/Suq/pull/52) · tag `v2026-10-29-3` not pushed
  (refused) — commit `189bd77`

- **Share a receipt as text (item 31)** — a Share button on the receipt page opens the phone's share sheet (Telegram,
  SMS) with the receipt as plain text in the UI language (`lib/sales/receipt-text.ts`, same content as the printout).
  Where Web Share is missing the text is copied; where neither exists the button is hidden. Works offline. Unit +
  offline e2e. [PR #50](https://github.com/Alphaguyasa/Suq/pull/50) · tag `v2026-10-29-2` not pushed (refused) — commit `e931bbe`

- **Dev-tooling advisories (item 16)** — vitest 4.1.12, vite 8.3.5, undici 8.12.3. `npm audit` (dev included) is at
  0. The lockfile was regenerated with npm 11 because npm 10's arborist still crashes. `braces` is no longer flagged.
  [PR #49](https://github.com/Alphaguyasa/Suq/pull/49) · tag `v2026-10-29-1` not pushed (refused) — commit `a23fb33`

- **Setup save failure + double-tap guard (rest of item 28)** — e2e: a refused shop name and a refused first cashier
  keep the wizard on the step with what was typed and say why. The retry found a real bug: two taps in the same task
  added the first cashier twice (stale `busy` state); a ref now guards `next()`.
  [PR #47](https://github.com/Alphaguyasa/Suq/pull/47) · tag `v2026-10-28-4` not pushed (refused) — commit `6aec552`

- **Offline e2e tests refuse the app origin (item 18)** — `goOffline()`/`goOnline()` in `e2e/helpers.ts`; the cold
  launch and offline-sync tests use them. [PR #46](https://github.com/Alphaguyasa/Suq/pull/46) · tag `v2026-10-28-3`
  not pushed (refused) — commit `a2e3757`

- **Test gaps (item 28, most of it)** — `adoptShopFromMembership` (error, no membership, cold start registers the
  device first, re-stamps placeholder rows, unchanged, refused after a pull), `lib/reports/period.ts` (Monday weeks,
  month/year rollover, the 31st, half-open bounds, leap February; passes in four time zones), `supabaseSyncClient`
  (42703 → `MissingColumnError`, other errors, keyset filters, upsert, serverNow), and e2e for a refused stock count,
  shop details and new cashier. Setup screen left as item 28. [PR #44](https://github.com/Alphaguyasa/Suq/pull/44) ·
  tag `v2026-10-28-2` not pushed (refused) — commit `f8fcd73`

- **Owner page stops polling when hidden (item 29)** — `useVisiblePolling()` stops the 15s Supabase query while the
  page is hidden and refreshes at once on return. Unit tests. [PR #43](https://github.com/Alphaguyasa/Suq/pull/43) ·
  tag `v2026-10-28-1` not pushed (refused) — commit `b919b5d`

- **A scanned code + Enter adds the item once (from item 28)** — the check item 28 asked for found a real bug: a USB
  scanner types the code and presses Enter before IndexedDB answers, so Enter ran a second lookup and every scan put
  two in the cart. Enter now waits for the typed lookup and reads the box itself; a lookup for a code typed past no
  longer adds a prefix product. New `e2e/scanner.spec.ts`. [PR #41](https://github.com/Alphaguyasa/Suq/pull/41) ·
  tag `v2026-10-27-2` not pushed (refused) — commit `17042f7`

- **Pulled timestamps in the till's format (item 34)** — `canonicalIso()` rewrites pulled timestamp columns from
  Postgres text (`…00.1+00:00`) to `toISOString()`; Dexie v6 rewrites rows already pulled. Narrower than first
  written: trimmed Postgres text mostly still sorts by time, but not at an equal instant, so a sale pulled at exactly
  a period boundary went into the previous period and two tills could each pick the other's void as THE void. The
  fake server can now answer in Postgres text. [PR #40](https://github.com/Alphaguyasa/Suq/pull/40) · tag
  `v2026-10-27-1` not pushed (refused) — commit `3c4c0e5`

- **Reports and sales history read only what they show (item 26)** — reports read the current and previous period
  through the `created_at` index plus only those sales' lines (one `anyOf`); history shows the newest 100 sales
  extended to whole days (honest day totals) with "show older sales"; receipt search still covers all history, and
  voided marks come from the `voids_sale_id` index. Unit + e2e. [PR #38](https://github.com/Alphaguyasa/Suq/pull/38) ·
  tag `v2026-10-26-4` not pushed (refused) — commit `da6578a`

- **Screens read stock from the cache (item 25)** — sale, products and reports read `stock_cache` (one row per
  product) instead of summing every movement; pulled movements now refresh the cache in the same transaction (they
  never did, so multi-till caches had drifted); Dexie v5 rebuilds the cache once from movements. `recentProductIds`
  is one `anyOf` query. Stock stays derived. [PR #37](https://github.com/Alphaguyasa/Suq/pull/37) · tag
  `v2026-10-26-3` not pushed (refused) — commit `84c8908`

- **Reset says what has not synced, offers the backup first (item 24)** — `unsyncedSummary()` reads the outbox; the
  danger section shows live how many records (and sales) exist only on this device and will be lost, with a
  "download a backup first" JSON button right there (backup export is one shared hook), or that everything has
  reached the server. Unit + e2e (synced → offline sale → warning → backup holds the sale → reconnect clears it).
  [PR #35](https://github.com/Alphaguyasa/Suq/pull/35) · tag `v2026-10-26-2` not pushed (refused) — commit `fd3fdbd`

- **Every till control is a 56px touch target (item 23)** — quick-cash and "total" buttons, discount buttons and
  input, cart remove ×, sale-complete link, sort/period/rank chips, back links and the "voided as" link raised to
  56px. `e2e/a11y.spec.ts` measures every visible control on the main screens at 360px and 1280px and checks the
  phone layout never scrolls sideways. [PR #34](https://github.com/Alphaguyasa/Suq/pull/34) (supersedes #33) ·
  tag `v2026-10-26-1` not pushed (refused) — commit `89eaf6e`

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
