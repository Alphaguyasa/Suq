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
"after the pending migrations". As of 2026-11-05 (run 24) that is item 50 (setup warns about a device code the
restored receipts use), then item 49.

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
Same step: an additive nullable `sale_items.cost_snapshot integer` column, then stop stripping it in
`lib/sync/push.ts` `forWire()` (item 27 keeps it on the till until the column exists).

## Replan 2026-10-22 (audit: sync/db/pages, RLS, i18n, perf, tests, features)
RLS is on for every table, append-only tables allow only SELECT/INSERT, no XSS sinks, and the only writes outside
`localWrite()` are the sanctioned `lib/sync/apply.ts` and the dev-only demo seed. Items below are ordered by priority.

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

### 42. [P3 · L] Major upgrades, one PR each: ~~vitest 5~~ (done), ~~typescript 6~~ (done), Next 16; typescript 7 and eslint 10 BLOCKED upstream
Read each changelog first; Next 16 is last and largest (Serwist compatibility, App Router changes). Stop and log if
any needs code changes beyond an S.
- **typescript 7 — blocked.** `typescript@7.0.2` has no classic JS compiler API (it exports only a version and
  `unstable/*`). Next's build type check and typescript-eslint need it, and typescript-eslint 8.72 allows only
  `<6.1.0`. Run 22 moved to 6.0.3 (the bridge release) instead. Retry when typescript-eslint and Next support 7.
- **eslint 10 — blocked.** eslint-config-next 15 allows eslint ≤9, and eslint-plugin-react 7.37, eslint-plugin-import
  2.32 and eslint-plugin-jsx-a11y 6.10 (latest, also used by eslint-config-next 16) all stop at ^9. Forcing it would
  need `--legacy-peer-deps`. Retry when those plugins list ^10.
- **Next 16** — the only part that can be done now. Large: split it.

## Replan 2026-11-03 (run 22: 4 open, 3 of them waiting on alpha; short audit)
`npm audit --omit=dev` is clean; dev has the same moderate build-tooling advisories as item 41. `npm outdated` shows
patch/minor updates (item 45) and the blocked majors above. No TODO/FIXME markers. Today's CI showed the build
fetching Google Fonts over the network: one of two runs on the same commit failed in `next/font`.

### 48. [P2 · S] Watch @serwist/next for a release on glob ≥ 14.0.2
Added 2026-11-04. `npm audit --omit=dev` reports 5 moderate advisories (GHSA-3g3m-2fjr-6pw4 in `glob` 13.0.6,
GHSA-g3hv-75wg-m249 in `minimatch` 10.2.6). They come only through `@serwist/next` 9.5.13 → `@serwist/build`, which
use them at build time to list files for the precache. The till does not ship them. The CI gate (`--audit-level=high`)
passes. npm's only automatic fix is a downgrade to @serwist/next 8, which is not acceptable. Check `npm view
@serwist/next version` each replan, and bump once a release depends on fixed versions. An `overrides` entry is the
fallback, if the precache build and the offline e2e still pass with it.

## Replan 2026-11-05 (run 24: 5 open, 4 of them blocked; short audit)
`npm audit --omit=dev` shows the same 5 moderate Serwist advisories as item 48 (`@serwist/next` still 9.5.13).
typescript-eslint still allows only TypeScript `<6.1.0`, and eslint-plugin-react still stops at eslint ^9. No TODO/FIXME
markers. Two findings came from building item 46.

### 50. [P2 · S] Setup warns when the device code is already on restored receipts
After a restore (item 46), step 2 of setup offers a random code, but the owner may type the old phone's code. That is
right when the old phone is gone: receipts continue past the restored ones. But if the old phone still works and sells
offline, both phones hand out the same numbers. Settings already warns with `isPrefixUsedByAnotherDevice()`. Setup does
not. Show the same ochre warning under the code field in setup, without blocking. Unit + e2e (restore, type A1, warning
shows; type B1, it goes away).

### 49. [P3 · S] A void with no discount stores `discount: -0`
`voidSale()` writes `discount: -target.discount`, which is `-0` when the sale had no discount. Money is still an integer
and every sum is right, but `-0` is not the "0" the rest of the code expects (`Object.is`, `toEqual`, and JSON turns it
into 0 anyway, so a restored void differs from the original). Write `0 - x` or normalise with `|| 0` for every negated
money and quantity field of a void, plus a test.

### 51. [P3 · S] Patch bump: @supabase/supabase-js 2.119
`npm outdated` shows 2.118.0 → 2.119.0 (minor, within the current major). Lockfile from npm 11, as in item 45. Read the
release notes for auth or realtime changes first. Full suite, including the e2e fake Supabase.

## Done

- **Share the reorder list as text (item 47)** — Reports → Low stock → "Share order list": shop name and phone, one
  line per low product (name in the UI language, on hand with unit, reorder level), offline through the share sheet.
  [PR #76](https://github.com/Alphaguyasa/Suq/pull/76) · tag `v2026-11-05-2` not pushed (refused) — commit `318850a`

- **Restore a JSON backup on a fresh till (item 46)** — setup step 1, empty till only. The whole file is checked first,
  then written in one transaction through `localWriteMany()` (rows queued for push), `stock_cache` is rebuilt and the
  shop_id adopted; the till keeps its own device_id and counter. Unit + offline e2e.
  [PR #75](https://github.com/Alphaguyasa/Suq/pull/75) · tag `v2026-11-05-1` not pushed (refused) — commit `e073d6c`

- **Patch/minor dependency bumps (item 45)** — next + eslint-config-next 15.5.29, vitest 5.1.0, tailwindcss +
  @tailwindcss/postcss 4.3.4, @vitejs/plugin-react 6.2.1, @electric-sql/pglite 0.5.15. Lockfile from npm 11.
  [PR #73](https://github.com/Alphaguyasa/Suq/pull/73) · tag `v2026-11-04-2` not pushed (refused) — commit `4f90301`

- **Self-hosted fonts (item 44)** — `next/font/local` with the committed woff2 files: Archivo and Noto Sans Ethiopic
  400–700, IBM Plex Mono 400–600 (Fontsource 5.3.0, SIL OFL 1.1, licences in `app/fonts/`). Same CSS variables. The
  build no longer fetches anything from Google. New e2e: a cold offline launch loads every font from the precache.
  [PR #72](https://github.com/Alphaguyasa/Suq/pull/72) · tag `v2026-11-04-1` not pushed (refused) — commit `d1a6511`

- **Gross profit uses the cost at the time of sale (item 27)** — each sale line records the product's cost
  (`cost_snapshot`, cents) and a void copies it, so a later price change no longer rewrites past profit; lines without
  one (older, pulled from another till, or sold with a blank cost) fall back to the current cost. The field stays on
  the till for now: push strips it (production has no column) and pull never overwrites it. No Dexie version, no
  migration. Unit + two-till sync test. [PR #70](https://github.com/Alphaguyasa/Suq/pull/70) · tag `v2026-11-03-2`
  not pushed (refused) — commit `b0a13d7`

- **typescript 6 (item 42, part 2)** — 6.0.3 instead of 7 (blocked, see item 42). `css.d.ts` declares plain `.css`
  imports, because TS 6 checks side-effect imports by default. 433 tests pass as before.
  [PR #69](https://github.com/Alphaguyasa/Suq/pull/69) · tag `v2026-11-03-1` not pushed (refused) — commit `9b8fb5a`

- **vitest 5 (item 42, part 1)** — vitest 5.0.5 with no config or test changes (433 tests pass as before).
  [PR #67](https://github.com/Alphaguyasa/Suq/pull/67) · tag `v2026-11-02-2` not pushed (refused) — commit `a4fd70e`

- **Forgotten owner PIN (item 43)** — "Forgot the owner PIN?" on the lock screen's name list and in Settings (when a
  cashier is unlocked) asks for the shop owner's Supabase email and password. A throwaway client checks them online,
  so the till's own session is untouched, and the account must have role `owner` in `shop_members` for this till's
  shop. Then `setOwnerPin()` sets the new PIN in one transaction. The saved session alone is not trusted, because
  whoever holds the tablet holds it. Without internet it says so. No new table. Unit + `e2e/owner-pin-recovery.spec.ts`.
  [PR #66](https://github.com/Alphaguyasa/Suq/pull/66) · tag `v2026-11-02-1` not pushed (refused) — commit `8f4ca2c`

- **Owner PIN for voids, price edits, reset and cashier management (item 32)** — setup's first cashier is the owner
  (`role: 'owner'`); tills set up earlier read their oldest cashier as the owner, so no Dexie upgrade rewrites rows.
  The last owner cannot be removed. When someone other than the owner is unlocked, the owner types their PIN inline in
  the action's own form (no modal); a wrong PIN writes nothing. Settings shows an Owner badge and can add another owner.
  Unit + `e2e/owner-approval.spec.ts`. [PR #63](https://github.com/Alphaguyasa/Suq/pull/63) (void) · tag
  `v2026-11-01-1` not pushed (refused) — commit `0ff6376`; [PR #64](https://github.com/Alphaguyasa/Suq/pull/64)
  (price, reset, cashiers) · tag `v2026-11-01-2` not pushed (refused) — commit `1e0a182`

- **Reset warning counts saved drawer counts (item 40)** — `unsyncedSummary()` counts the local-only `cash_closes`,
  and the reset warning says they will be lost even on a fully synced till. The "all synced" line is shown only when
  nothing would be lost. The new e2e step exposed a real crash: `getSettings()` wrote default settings inside
  `useLiveQuery` (Settings, Reports, receipt view), so once a reset wiped the row, Dexie threw `ReadOnlyError` and
  Settings went to the error screen instead of `/setup`. `getSettings()` is now read-only. New `settings.test.ts`
  (2 of 3 fail on the old code). [PR #61](https://github.com/Alphaguyasa/Suq/pull/61) · tag `v2026-10-31-3` not
  pushed (refused) — commit `3cd1ded`

- **Moderate build-tooling advisories (item 41), accepted, no change** — no patched version exists within any
  dependent's range. @serwist/build and @serwist/next pin `glob` to exactly 13.0.6 (the fix is 14.0.2), and every
  `minimatch` user asks for ^3 or ^10 (the fix is ≥11.0.1, which changed the export API; even eslint 10 still uses ^10).
  Forcing majors under the service-worker build would add risk for an advisory that cannot reach the till: build/lint
  time only, inputs are our own globs. The CI gate `npm audit --omit=dev` stays clean. Revisit when Serwist or eslint
  move (check during item 42).

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
