# ROADMAP — Suq

Prioritized backlog. The daily run takes the **top open item**. Priority: **P0** = broken/insecure/rule
violation, **P1** = real user or demo impact, **P2** = quality/UX/perf, **P3** = new feature / nice to have.
Effort: **S** < 2h, **M** half a day, **L** a day or more (split L items into smaller PRs).

When an item merges, move it to **Done** with its PR link and release tag. When fewer than 5 items are open,
REPLAN (see CLAUDE.md §6).

Built from the Phase 0 audit on 2026-10-14 (full read of the codebase, docs, `npm audit`, a production build,
and the unit test suite).

## Open

### 1. [P0 · S] Patch vulnerable dependencies (Next.js critical advisory)
`npm audit --omit=dev` reports 8 production advisories, including a **critical** Next.js advisory (RCE on
Windows-hosted servers / image optimizer) plus high ones in `postcss`, `browserslist` (via `@serwist/next`),
`sharp`, `nanoid`, `brace-expansion`, `source-map-js`. All have non-breaking fixes (`npm audit fix`, Next
15.5.x patch). Bump within the current majors, re-run every gate, and add a CI step that fails on new
high/critical production advisories (`npm audit --omit=dev --audit-level=high`).

### 2. [P0 · M] Pull silently truncates at the PostgREST row limit → rows never reach the device
`client.fetchSince()` issues one `select` with no range. Supabase caps responses (default 1000 rows), and
`pullOnce()` then advances `last_pull_at` to server time, so everything beyond the cap is **skipped forever**
on that device (a second till joining a shop with a month of sales gets a partial history and wrong stock).
Page through results (`.range()` / order by watermark + id) until a short page, and only then commit the
watermark. Fake server must enforce a cap so the sync tests catch regressions.

### 3. [P0 · M] Pull skips rows that reach the server late (offline sales from another till are lost to this till)
`pullOnce()` takes its watermark from the **server** clock (`server_now()`), but filters rows by
`created_at`/`updated_at`, which are stamped by the **device** at sale time. Till B pulls at 10:00 (watermark
10:00). Till A was offline and made a sale at 09:50; it pushes at 10:05 with `created_at = 09:50`. B's next
pull asks for `created_at > 10:00` and **never receives A's sale** — B's history and stock are permanently
wrong. Same for product edits from a device with a slow clock. The existing clock-skew test does not catch it
because its fake server stamps rows with server time. Fix: additive migration adding a server-assigned
`received_at timestamptz not null default now()` (set by trigger on insert/update, client value ignored) +
`(shop_id, received_at)` indexes on all four synced tables; pull filters on `received_at` with a small
overlap window (re-reads are free: apply is idempotent); `received_at` stripped before push; fall back to the
old column if the migration is not yet applied. Fake server must model "pushed late" and the sync tests must
cover it (two offline tills, one pulls in between). Backfill existing rows' `received_at` from
`created_at`/`updated_at`, and reset each device's watermark once so rows already lost are recovered
(relies on item 2's pagination).

### 4. [P0 · S] Request persistent storage on first run and show the result in Settings
Project rule, currently not implemented anywhere: nothing calls `navigator.storage.persist()`. On a cheap
Android phone under storage pressure the browser may evict IndexedDB — i.e. delete unsynced sales. Request
persistence on first run (AppShell boot), store the outcome locally, show "granted / not granted / not
supported" in Settings with a retry button and a bilingual explanation. Unit test the helper (granted,
denied, unsupported, already persisted) and an e2e assertion that Settings shows the state.

### 5. [P0 · M] Receipt and product detail pages fail offline
`/sales/[id]`, `/products/[id]` and `/products/[id]/stock` are dynamic routes (`ƒ` in the build output).
Offline, the RSC fetch for an id that was never visited fails and the service worker serves `/offline`.
The sale screen links to `/sales/<id>` right after a sale ("Sale complete A1-000042") — exactly the step in
the demo after the wifi is switched off. Fix by serving these pages from static shells (e.g. query-param routes
`/sales/view?id=` with redirects from the old paths, or a SW navigation route that maps `/sales/*` to a
precached shell). Playwright test: go offline, complete a sale, open its receipt, void it.

### 6. [P1 · S] Test that old IndexedDB data survives every Dexie schema upgrade
Project rule. The schema is at v3 (v1 core tables, v2 `shop_settings`, v3 `cashiers`) and there is no
upgrade test. Add a test that opens a raw v1 database with real rows, then opens `SuqDatabase` and asserts
every row (sales, items, movements, outbox, device_meta incl. receipt counter) survived, and the same for
v2→v3. Add a test helper so every future `version(n)` change gets its own test cheaply.

### 7. [P1 · S] Device reset restarts the receipt counter → duplicate receipt numbers in the cloud
`resetDevice()` clears `device_meta`; re-running setup with the same prefix (the default is `A1`) restarts
the counter at 000001, so the shop gets two different sales both numbered `A1-000001`. Similarly, Settings
lets the prefix be changed to one another till already uses. Fix: after reset, seed the counter from the
highest receipt number this device prefix has in the cloud (on first pull) and/or warn when the prefix is
already used by another device; make the setup default prefix unique-ish. Tests for both paths.

### 8. [P1 · S] Pill / status queries scan the whole outbox on every change
`useSyncStatus()` reads every outbox row (`orderBy('id').toArray()`) on every IndexedDB change to compute
the max attempts. With 200+ queued rows on a cheap phone (the cold-start case) this runs on every keypress
that writes. Track a `blocked` flag via an indexed query (e.g. index `attempts`, `where('attempts').aboveOrEqual(5)`)
— needs a Dexie v4 schema bump + upgrade test (item 6's helper).

### 9. [P2 · S] Language choice is not remembered
`I18nProvider` keeps the language in React state; every reload or app launch is back to Amharic. Persist the
choice locally (device setting) and set `<html lang>` accordingly. Test the toggle round-trip.

### 10. [P2 · M] Accessibility pass on the till
Audit with axe in Playwright (sale screen, settings, receipt): labels on icon-only buttons, focus order, colour
contrast of `--muted` on `--paper`, `aria-live` for the sync pill and the sale-complete confirmation. Fix
what it finds; keep an axe check in the e2e suite.

### 11. [P2 · M] Error boundary and storage-failure handling
No `app/error.tsx` / `global-error.tsx`: a thrown error in any client page blanks the till. IndexedDB quota
or `QuotaExceededError` on a sale is not surfaced. Add bilingual error boundaries with a reload action, and a
clear message (not a silent failure) when a sale cannot be written.

### 12. [P3 · M] Optional camera barcode scanning (@zxing/browser)
Many shops have no USB scanner. Add a camera scan button on the sale screen and product form, lazily loaded
(dynamic import, so it never weighs on the till's first load), behind feature detection. Works offline.
(Note: `docs/RULES.md` lists camera scanning as not in v1; this item is the explicit decision to add it as
optional. MIT-licensed, Apache-2.0 for zxing core.)

### 13. [P3 · M] Replicate shop settings so the owner dashboard shows the shop name
`shop_settings` is local-only; the owner view on a second device cannot show which shop it is looking at.
Additive migration (new table, RLS like the others) + LWW sync like `products`. Migration file + test.

### 14. [P3 · S] Daily backup export (CSV/JSON) from Settings
For shops that never sign in to sync, a one-tap export of sales and stock movements is the only backup.
Offline, no server needed (Blob download). Bilingual.

### 15. [P1 · S] Server does not enforce last-write-wins on products
A product edit queued offline and pushed late overwrites a newer edit already on the server (plain upsert, no
`updated_at` guard). Additive fix: a BEFORE UPDATE trigger that keeps the row when `new.updated_at <= old.updated_at`. Migration + test.

## Done

- **Project setup** — CLAUDE.md/ROADMAP/logs, ESLint, Playwright offline e2e + fake Supabase, CI; fixed offline
  cold launch (page HTML not precached) and shop adoption race on fresh devices. [PR #1](https://github.com/Alphaguyasa/Suq/pull/1) · `v2026-10-14-1`
