# ROADMAP — Suq

Prioritized backlog. The daily run takes the **top open item**. Priority: **P0** = broken/insecure/rule
violation, **P1** = real user or demo impact, **P2** = quality/UX/perf, **P3** = new feature / nice to have.
Effort: **S** < 2h, **M** half a day, **L** a day or more (split L items into smaller PRs).

When an item merges, move it to **Done** with its PR link and release tag. When fewer than 5 items are open,
REPLAN (see CLAUDE.md §6).

Built from the Phase 0 audit on 2026-10-14 (full read of the codebase, docs, `npm audit`, a production build,
and the unit test suite).

## Open

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

### 17. [P1 · S] Pre-commit secret scanner never runs (hook file not executable)
`.githooks/pre-commit` is committed as mode 644, so git prints "hook was ignored because it's not set as
executable" and commits go through unscanned. Fix: `git update-index --chmod=+x .githooks/pre-commit`, and
add a CI step that runs the scanner over the PR diff so it is enforced even where hooks are not configured.

### 16. [P2 · S] Dev-tooling advisories (vitest, undici via jsdom, braces via eslint-config-next)
`npm audit` (dev included) still reports high/moderate advisories in test/lint tooling only — nothing that
ships to a till. `npm install` currently crashes in npm 10's arborist (`Cannot read properties of null
(reading 'edgesOut')`, peer-set resolution of vitest's optional `jsdom` peer) when bumping vitest to 4.1.11
or overriding undici ≥ 8.10.2. Retry with a newer npm or by regenerating the lockfile; `braces` has no fixed
release yet (every version affected) — wait for upstream.

### 15. [P1 · S] Server does not enforce last-write-wins on products
A product edit queued offline and pushed late overwrites a newer edit already on the server (plain upsert, no
`updated_at` guard). Additive fix: a BEFORE UPDATE trigger that keeps the row when `new.updated_at <= old.updated_at`. Migration + test.

### 18. [P2 · S] Harden the older offline e2e tests against service-worker network leaks
Found while doing item 5: in Chromium, `context.setOffline(true)` does not stop requests the service
worker makes itself, so a page missing from the precache can still load "offline" in a test.
`e2e/offline-detail-pages.spec.ts` also blocks the app origin with `context.route` (`goOffline()`); move that
helper into `e2e/helpers.ts` and use it in `offline-launch.spec.ts` and `offline-sync.spec.ts` (keep the
fake Supabase routes working), so those tests prove what they claim.

## Done

- **Dexie upgrade survival tests (item 6)** — schema versions in an append-only `SCHEMA_VERSIONS` list;
  `openAtVersion()` helper; `lib/db/upgrade.test.ts` fills a database at every historical version, upgrades it,
  and checks rows, receipt counter, indexes, new tables and the outbox sequence; it freezes published versions
  and requires a fixture per table. [PR #13](https://github.com/Alphaguyasa/Suq/pull/13) · 7e19f07

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
