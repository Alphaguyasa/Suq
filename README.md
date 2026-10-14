# ሱቅ / Suq — Offline-First POS & Inventory

A point-of-sale and stock system for small shops that **keeps working when the internet and the power go out**, then reconciles cleanly when they come back.

Built for Ethiopian retail: Amharic-first UI, ETB pricing, 80mm thermal receipts, runs on a cheap Android tablet behind the counter.

---

## The one architectural idea that matters

Everything else here is ordinary CRUD. This is not:

> **Never sync stock quantities. Sync stock *movements*.**

If two tablets are offline and both sell the last case of water, and each syncs `stock_qty = 11`, one shop's sale silently vanishes. Last-write-wins destroys data.

If instead each device appends `{product, qty_delta: -1}` and stock on hand is `SUM(qty_delta)`, both sales survive and the arithmetic is correct no matter what order they arrive in. Append-only rows commute; absolute values don't.

The same principle covers sales — immutable and append-only, where a mistake becomes a `void` row rather than a deletion — and gives you an audit trail as a free side effect.

`docs/BUILD_GUIDE.md` develops this properly.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| Styling | Tailwind CSS v4 |
| Local database | Dexie 4 (IndexedDB) — **the source of truth** |
| Cloud database | Supabase Postgres — a replica, never authoritative |
| Offline shell | Serwist (`@serwist/next`) |
| Barcode | USB scanner (acts as a keyboard) |
| Receipts | CSS `@page` at 80mm |
| Deploy | Vercel |

**Runtime cost: zero.** No per-transaction API, no metered services. A CRUD app with a careful sync layer.

---

## Quick start

**Prerequisites:** Node 20+, a Supabase project (free tier is fine).

```bash
git clone https://github.com/Alphaguyasa/Suq.git
cd Suq
npm install
```

Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

Fill in the two values from your Supabase project (Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Both are public by design — they ship in the browser bundle and are protected by row-level security. **Never** put a service-role key here; it bypasses every RLS policy, and `lib/supabase/client.ts` throws if it finds one.

Apply the database schema by running the four files in `supabase/migrations/` in order, via the Supabase SQL editor or `supabase db push`.

```bash
npm run dev        # localhost:3000
```

The app works without any of the Supabase setup above — it just won't sync.

---

## Using the app, start to finish

### 1. First run — setup

A fresh device opens **`/setup`**, a four-step wizard:

1. **Shop details** — name in Amharic and English, phone, address. These print on every receipt.
2. **Device code** — a short prefix like `A1`. It goes into every receipt number, so two tills at two counters never issue the same one. Give each device a different code.
3. **First cashier** — a name and a 4-digit PIN.
4. **Products** — optionally import a CSV now, or skip and add them later.

CSV columns: `name, name_am, barcode, unit, cost_price, sell_price, reorder_level, opening_qty`

Prices are in **birr**, as a shop owner would write them — `12.35` means 12.35 ETB. They are converted to integer cents on import and stored that way.

### 2. Selling — `/`

The default route, and the screen that matters.

- **Search box is auto-focused** and re-focuses after every add. A USB barcode scanner just types into it — scan and the item drops into the cart with no confirmation step.
- No scanner? Type a name in Amharic or English, or tap a product tile. Recently-sold items float to the top.
- Cart on the right: quantity steppers, per-line totals, remove. Subtotal, optional discount by amount or percent, then the **total in 48px mono** — sized to be read from the customer's side of the counter.
- Choose **Cash**, **Telebirr**, or **Card**. Cash opens an amount-received → change-due calculator.
- Press the green pay button.

Keyboard: **F2** focuses search · **F4** completes the sale · **Esc** clears the cart.

Selling below reorder level is allowed with an ochre hint. Selling into negative stock is allowed with a warning — shops miscount, and blocking a real sale over a data discrepancy is how software gets abandoned.

Completing a sale never touches the network. It writes to IndexedDB in one transaction and returns in well under 100ms.

### 3. Receipts — `/sales`

Every sale is listed with its receipt number. Open one to reprint at 80mm, or to **void** it.

A void never deletes anything. It writes a `void` sale plus compensating stock movements, so the audit trail stays intact and stock returns to correct.

### 4. Products and stock — `/products`

Add or edit products: name in both languages, barcode, unit, cost price, sell price, reorder level. Low-stock items are flagged in ochre.

Each product has a **stock screen** for restocking and adjustments. Every change is a movement with a reason — never an overwrite. On-hand is always the sum of movements.

### 5. Reports — `/reports`

Today, this week, this month. Gross profit, top products, low stock, and a per-cashier cash-up sheet for the end of the day.

### 6. Owner view — `/owner`

A read-only dashboard meant for the owner's phone while the tablet stays on the counter.

### 7. Settings — `/settings`

Shop details, receipt footer, device code, printer width, language toggle, and cashier management (add/remove, PINs).

At the bottom is the only genuinely destructive action in the app: **reset device**, which erases everything local and requires typing the shop name to confirm.

### 8. The sync pill

Top of the screen, always visible, four states:

| State | Colour | Meaning |
|---|---|---|
| Synced | green | Everything has reached the cloud |
| Syncing | green | Draining now |
| Offline | ochre | No connection — *N* sales waiting. Selling continues normally |
| Blocked | ochre | Connected but the server rejected something; nothing has been lost |

The pill is never red. A stalled sync has destroyed nothing, and red is reserved for destructive actions.

To sync at all, sign in at **`/signin`** with a Supabase account — every RLS policy is `to authenticated`. The till itself does not care: it works offline whether or not anyone has signed in.

### 9. PIN lock

The screen locks after five idle minutes. Any tap or keypress resets the timer, so it won't lock mid-sale. Cashiers unlock with their 4-digit PIN, which is also how each sale is attributed to a person for the cash-up sheet.

---

## Going offline (and the demo)

The app is a PWA. After the first load it runs entirely from the service worker and IndexedDB.

To see the point of it, run the sequence in `docs/DEMO_SCRIPT.md`:

1. Ring up three items
2. Kill the wifi **mid-sale** — the UI doesn't flinch, the pill turns ochre
3. Complete two more sales offline — the pill counts to 3
4. Restore the wifi — the pill drains to zero within about 15 seconds
5. The owner dashboard on a second device shows all five sales

---

## Deploying

```bash
npm i -g vercel
vercel --prod
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel project for the Production environment.

**Installing on the tablet:** open the production URL in Chrome, then Menu → *Install app* / *Add to Home screen*. It launches standalone, with no browser chrome, and works offline from then on.

Two cost notes, neither a blocker today:

- **Vercel Hobby is non-commercial.** A paying client puts you on Pro at $20/month.
- **Supabase free projects pause after 7 days of inactivity.** An annoyance during the build; an outage under a live shop. Budget $25/month for a real deployment.

---

## Commands

```bash
npm run dev        # localhost:3000
npm run build
npm run start      # serve the production build
npm run typecheck  # strict tsc, no emit
npm run test       # vitest
npm run seed       # validate the starter catalogue
npm run seed:demo  # validate the 30-day demo dataset
npm run icons      # regenerate PWA icons
```

`seed` and `seed:demo` **validate** data rather than load it — IndexedDB lives in the browser, so there is no database for Node to write to. Loading happens in-app at `/dev/seed`, which exists only in `next dev` and is deliberately absent from production builds.

---

## Tests

```bash
npm run test
```

The suite that earns its keep is `lib/sync/sync.test.ts`, which covers the five failure modes that only appear across multiple devices:

1. **Two-device concurrent sale** — both offline, both sell the last unit; asserts `SUM(qty_delta) = -2` and that both sales survive, in either sync order
2. **Interrupted push** — network dies mid-drain; asserts no duplicates and no orphaned child rows
3. **Clock skew** — one tablet five minutes fast; asserts no rows are skipped on pull
4. **Cold start with 200 queued sales** — asserts batched draining without freezing
5. **Void after sync** — asserts compensating movements land and stock ends correct on both sides

There is also a live suite that runs against real Supabase — real auth, real RLS, real latency:

```bash
SUQ_LIVE=1 npx vitest run lib/sync/live
```

---

## Documentation

| File | What it covers |
|---|---|
| `docs/RULES.md` | The eight non-negotiable engineering rules. Read before changing anything. |
| `docs/BUILD_GUIDE.md` | Architecture, data model, sync design, design system |
| `docs/DEMO_SCRIPT.md` | The 90-second demo, Amharic + English |
| `docs/PROJECT_AMHARIC.md` | The project explained in Amharic — client pitch and technical overview |

---

## What "done" looks like

Not a feature list — a moment. You hand a shop owner a tablet. They ring up three items. You reach over and switch off the wifi mid-sale. They keep selling. You switch it back on and the sync pill counts down to zero while their phone shows the same sales appearing in the owner dashboard.
