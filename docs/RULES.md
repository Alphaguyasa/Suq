# Engineering rules — Suq POS

The short version of `BUILD_GUIDE.md`. If a change breaks one of these rules, the change is wrong.

## What this is

Offline-first point-of-sale and inventory for small shops in Ethiopia. Runs on a cheap Android tablet behind a counter. Must keep working through internet outages and power cuts, and reconcile correctly when several devices have been selling offline at once.

## Non-negotiable rules

**1. IndexedDB is the source of truth. Supabase is a replica.**
No UI action ever awaits the network. Every read and write goes to Dexie. An `await supabase...` inside a component is a bug — that belongs in the sync worker.

**2. Never store or sync absolute stock quantities.**
Stock on hand is `SUM(stock_movements.qty_delta)`. Always. A `stock_cache` table exists for render speed, but it is only ever recomputed from movements, never written to directly. Syncing an absolute quantity silently destroys concurrent offline sales — this is the single worst bug this codebase can have.

**3. All mutations go through `localWrite()` in `lib/db/write.ts`.**
It writes the domain row and the outbox row in one IndexedDB transaction. Never call `db.<table>.put()` from anywhere else. No exceptions.

**4. IDs are client-generated UUIDs.**
`crypto.randomUUID()` at creation. Never wait for a server to assign identity. This is what makes retries idempotent.

**5. Money is integers, in cents.**
`12.35 ETB` is stored as `1235`. Format only at the render boundary with `formatETB()`. Never use floats for money anywhere.

**6. `sales`, `sale_items`, and `stock_movements` are immutable.**
No updates, no deletes. A correction is a new `void` sale plus compensating movements. Postgres has no update/delete RLS policy on these tables — client code respects that too.

**7. Sale prices are snapshotted.**
`sale_items` stores `name_snapshot` and `unit_price` at the time of sale. Never join to `products` to reconstruct historical prices — the product's price will have changed.

**8. Server time is the sync watermark.**
Never `Date.now()` for `last_pull_at`. Tablet clocks drift and rows get silently skipped.

## Stack

Next.js 15 App Router · TypeScript strict · Tailwind v4 · Dexie 4 + `dexie-react-hooks` · Supabase JS v2 · Serwist (`@serwist/next`) for PWA.

Barcode input is a USB scanner, which types into whatever has focus — so focus discipline on the sale screen *is* the barcode feature. There is no camera scanning in v1 and no scanner library.

All POS routes are client components. There is no server-side data fetching in the till UI.

## Design tokens

```css
--ink: #16181D;  --paper: #FBFAF7;  --rule: #E2DFD8;
--birr: #1B7A5A; --ochre: #C9760E;  --alarm: #B3261E;  --muted: #6B7280;
```

Green = money, confirm, synced. Ochre = offline, pending, low stock. Red = destructive only, and it should appear about twice in the whole app.

Type: **Archivo** (UI), **Noto Sans Ethiopic** (Amharic — always, never fall back), **IBM Plex Mono** with `tabular-nums` (every number).

Touch targets minimum 56px, pay button 64px. Running total is the largest thing on screen at 48px+ mono. No modals on the sale screen.

## Language

Amharic is the primary UI language, English secondary. Every user-facing string goes in `lib/i18n/{am,en}.ts` — no hardcoded strings in components. Products carry both `name` and `name_am`.

## Out of scope for v1

Multi-branch · suppliers · accounting export · customer credit accounts · loyalty · multi-currency · purchase orders · expiry tracking · label printing · staff scheduling.

Every one of these is a real thing a shop owner will ask for in the first meeting. The answer is "that's phase two" — a finished v1 that does six things flawlessly sells, and an unfinished v1 that half-does twenty things does not.

## Definition of done for any change

- `npm run build` passes clean
- `npm run typecheck` passes with strict TypeScript
- Works with DevTools set to offline
- No hardcoded user-facing strings
- Amharic renders correctly (check with a real Amharic product name, not lorem ipsum)
- Money paths use integer cents end to end
