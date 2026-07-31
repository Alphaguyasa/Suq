# Suq — Build Guide

Architecture, data model, sync design, and design system. Keep this open while you build.

---

## 1. The problem, stated precisely

A shop in Addis has intermittent internet and scheduled power cuts. Existing POS software assumes a connection and fails closed — the cashier stops selling. Paper ledgers never fail, but the owner can't answer "what did we sell yesterday?" without an hour of arithmetic, and can't see the shop at all from home.

So the product has exactly two jobs:

1. **The cashier can always complete a sale.** No network state ever blocks the transaction.
2. **The owner can see the shop from their phone,** with numbers that are correct even when several devices sold offline simultaneously.

Job 1 is a UI discipline. Job 2 is a data-modelling problem. Job 2 is where projects like this usually go wrong.

---

## 2. Architecture

```
┌─────────────────────────────────────────────┐
│  Tablet / phone — the shop counter          │
│                                             │
│  React UI (Next.js, all client components)  │
│         ↕ useLiveQuery                      │
│  Dexie / IndexedDB   ← SOURCE OF TRUTH      │
│    products · sales · sale_items            │
│    stock_movements · outbox                 │
│         ↕                                   │
│  Sync worker (drains outbox, pulls deltas)  │
└──────────────────┬──────────────────────────┘
                   │ only when online — never blocking
                   ▼
        ┌──────────────────────────┐
        │  Supabase Postgres       │
        │  same tables + RLS       │
        │  stock = SUM(qty_delta)  │
        └──────────────────────────┘
                   ▲
                   │
        ┌──────────────────────────┐
        │  Owner dashboard (phone) │
        │  reads cloud, read-only  │
        └──────────────────────────┘
```

**The inversion that makes it work:** IndexedDB is the database. Supabase is a replica. Every read and write in the POS UI hits Dexie and returns in single-digit milliseconds. The network is a background process that the UI is never allowed to wait on.

Most "offline support" is built the other way round — talk to the server, fall back to a cache on failure — and it's always fragile, because the failure path is the rare path and therefore the untested one. Here the offline path *is* the only path. Sync is additive.

---

## 3. Data model

### 3.1 The three-tier rule

Every table falls into one of three tiers, and the tier dictates its conflict rule. Get this right and sync is 200 lines. Get it wrong and it's a permanent source of bugs.

| Tier | Tables | Conflict rule | Why it's safe |
|---|---|---|---|
| **Append-only** | `sales`, `sale_items`, `stock_movements` | None needed | Rows are immutable and independent. Any arrival order produces the same result. |
| **Last-write-wins** | `products`, `shop_settings` | Higher `updated_at` wins | Edited rarely, by one admin, from one device. Collisions are near-impossible and harmless. |
| **Local only** | `outbox`, `device_meta` | Never syncs | Machinery, not data. |

### 3.2 Tables

All IDs are `uuid`, generated **client-side** with `crypto.randomUUID()`. Never wait for a server to assign an identity — that alone would break offline writes.

```ts
// ---- products ---------------------------------------------------
{
  id: string            // uuid, client-generated
  shop_id: string
  name: string          // "Ambo Water 1L"
  name_am: string       // "አምቦ ውሃ 1 ሊትር"
  barcode: string | null
  unit: 'pcs' | 'kg' | 'l' | 'pack'
  cost_price: number    // ETB, integer cents — see §3.3
  sell_price: number
  reorder_level: number // low-stock threshold
  is_active: boolean
  updated_at: string    // ISO, LWW key
  deleted_at: string | null   // soft delete only
}

// ---- sales (immutable) ------------------------------------------
{
  id: string
  shop_id: string
  device_id: string
  receipt_no: string    // "A1-000142" — device-prefixed, see §3.4
  subtotal: number
  discount: number
  total: number
  payment_method: 'cash' | 'telebirr' | 'card' | 'credit'
  cashier_name: string
  voided_by: string | null   // uuid of the void record, if voided
  created_at: string
  synced_at: string | null   // local only, stripped on push
}

// ---- sale_items (immutable) -------------------------------------
{
  id: string
  sale_id: string
  product_id: string
  name_snapshot: string   // price and name AT TIME OF SALE
  unit_price: number      // never join to products for history
  qty: number
  line_total: number
}

// ---- stock_movements (immutable, append-only) -------------------
{
  id: string
  shop_id: string
  product_id: string
  qty_delta: number       // negative for sales, positive for restock
  reason: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'opening'
  ref_id: string | null   // sale_id when reason = 'sale'
  note: string | null
  created_at: string
  device_id: string
}

// ---- outbox (local only, never leaves the device) ---------------
{
  id: number              // auto-increment
  table: 'products' | 'sales' | 'sale_items' | 'stock_movements'
  op: 'upsert'
  row_id: string
  payload: object
  created_at: string
  attempts: number
  last_error: string | null
}
```

### 3.3 Money is integers

Store ETB in **cents as integers**. `12.35` becomes `1235`. Format only at the render boundary.

Floating-point money in a system that sums thousands of rows will eventually produce a total that's off by a cent, and the one person guaranteed to notice is the shop owner counting the cash drawer. That conversation costs you the client. Use integers.

### 3.4 Receipt numbers

Format: `{DEVICE_PREFIX}-{6-digit local counter}` → `A1-000142`.

Each device is assigned a short prefix at setup (`A1`, `A2`, `B1`). The counter is local and monotonic. Two offline devices can never collide, and no coordination is required. The prefix also tells you instantly which till a receipt came from — genuinely useful when reconciling at close of day.

### 3.5 Stock on hand is derived, never stored

```sql
-- server
select product_id, sum(qty_delta) as on_hand
from stock_movements
where shop_id = $1
group by product_id;
```

```ts
// client — Dexie
const onHand = await db.stock_movements
  .where('product_id').equals(productId)
  .toArray()
  .then(rows => rows.reduce((sum, m) => sum + m.qty_delta, 0));
```

Cache it in a `stock_cache` table for fast product-grid rendering, but the cache is always recomputed from movements — never written to directly. If the cache and the movements ever disagree, the movements are right.

**This is the whole design.** Two devices, both offline, both sell the last case of water:

- Device A appends `qty_delta: -1`
- Device B appends `qty_delta: -1`
- Both sync in whatever order
- `SUM = -2`. Correct. Nothing was overwritten.

Now try it with `stock_qty = 11` on both sides. Whichever syncs last wins, one sale is silently erased, and the owner's stock count drifts from reality a little more every day until they stop trusting the system. That's how software like this dies — not with a crash, but with a slow loss of confidence.

### 3.6 Corrections are records, not deletions

Cashier rings up the wrong item. You do **not** delete the sale. You:

1. Insert a `void` sale row referencing the original
2. Insert compensating `stock_movements` with inverted deltas
3. Set `voided_by` on the original

Deletions don't sync — there's no row left to carry the news. A tombstone might, but then you need tombstone garbage collection and ordering guarantees, and you've built a distributed systems problem into a shop till. Append-only sidesteps all of it, matches how retail accounting already works, and hands you a complete audit trail as a side effect. When the owner asks "who voided this?", you can answer.

---

## 4. The sync engine

### 4.1 Push

```
every 15s while online, and immediately after any write:
  batch = outbox.orderBy('id').limit(50)
  if batch is empty → done
  group batch by table
  for each table:
    POST to Supabase with upsert onConflict: 'id', ignoreDuplicates: true
  on success → delete those outbox rows
  on failure → attempts++, record error, exponential backoff (2s → 60s cap)
```

Every write is **idempotent** because the client generated the UUID. Retrying a push that actually succeeded but whose response was lost is a no-op. This is why client-generated IDs matter beyond just working offline — they make the network's unreliability harmless.

### 4.2 Pull

```
every 60s while online:
  since = device_meta.last_pull_at
  for each table:
    GET rows where updated_at > since  (or created_at for append-only tables)
  apply:
    append-only → insert if not exists, skip if exists
    LWW         → overwrite only if incoming.updated_at > local.updated_at
  last_pull_at = server time from the response header, NOT Date.now()
```

Use **server time** as the watermark. Tablet clocks drift, and a device whose clock is 3 minutes fast will silently skip a window of rows on every pull. This bug is very hard to find later.

### 4.3 Writes go through one function

```ts
// lib/db/write.ts — the ONLY way anything mutates
export async function localWrite<T>(
  table: TableName,
  row: T & { id: string }
): Promise<void> {
  await db.transaction('rw', db[table], db.outbox, async () => {
    await db[table].put(row);
    await db.outbox.add({
      table, op: 'upsert', row_id: row.id,
      payload: row, created_at: new Date().toISOString(),
      attempts: 0, last_error: null,
    });
  });
}
```

Domain row and outbox row are written in **one IndexedDB transaction**. Either both land or neither does. If the tab is closed mid-write, you never end up with a sale that exists locally but will never sync — the single most damaging failure mode this app can have, because it's invisible until reconciliation.

Enforce this in `CLAUDE.md`: nothing calls `db.sales.put()` directly. Ever.

### 4.4 Sync states

Four, and the UI must express all four honestly:

| State | Condition | Pill |
|---|---|---|
| Synced | online, outbox empty | green dot, `ተመሳስሏል` |
| Syncing | online, drain in progress | pulsing, `በማመሳሰል ላይ` |
| Offline | no network, outbox has N | ochre, `ከመስመር ውጭ · N ተቀምጧል` |
| Blocked | attempts > 5 on any row | red, `ማመሳሰል አልተሳካም` — tap for detail |

The offline state **counts**. It doesn't apologize and it doesn't hide. "12 sales saved" is a promise the app is visibly keeping — that's reassurance, where a generic "offline" warning is just anxiety.

---

## 5. Design system

**Brief:** a cashier standing at a counter, mid-afternoon glare on the screen, one hand on the tablet and the other bagging items. Cheap Android hardware. The screen has one job: complete this sale without hesitation.

**Vernacular of the subject:** thermal receipt paper, the ballpoint ledger it replaces, hand-marked price tags, the birr note itself.

### 5.1 Palette

```css
--ink:      #16181D;  /* ledger ink — text, primary surfaces */
--paper:    #FBFAF7;  /* thermal receipt white, faintly warm */
--rule:     #E2DFD8;  /* hairlines, dividers */
--birr:     #1B7A5A;  /* deep note-green — money, confirm, complete */
--ochre:    #C9760E;  /* offline / pending — warm, not alarming */
--alarm:    #B3261E;  /* destructive only: void, delete */
--muted:    #6B7280;  /* secondary text */
```

Green is reserved for money and completion — it appears on the pay button, the total, and the synced state, nowhere else. Ochre owns offline and low-stock: "attention", not "error". Red appears perhaps twice in the entire app. When a colour means exactly one thing, the interface becomes readable at a glance, which is the only speed that matters at a counter.

### 5.2 Type

| Role | Face | Notes |
|---|---|---|
| UI, buttons, headings | **Archivo** | Grotesque, sturdy, signage-like. Holds up at a glance and under glare. |
| Amharic | **Noto Sans Ethiopic** | Non-negotiable. Fallback rendering of Ethiopic is genuinely bad. |
| Numbers | **IBM Plex Mono**, `font-variant-numeric: tabular-nums` | Every price, quantity, total, receipt number. |

Tabular figures matter more here than anywhere else you've built. Prices in a cart must align on the decimal, and digits must not shift width as a total ticks up during scanning. Proportional figures make a column of money look sloppy, and "sloppy" is the exact impression that loses a client who counts cash for a living.

### 5.3 Touch and scale

- Minimum touch target **56px**. 64px for the pay button. This is a fingertip on a bagging counter, not a mouse.
- The running total is the largest element on screen: **48px+ mono**, high contrast. Visible from the customer's side.
- Product tiles in a grid, not a list — recognition beats reading when you've rung up the same twelve items all morning.
- Never a modal on the sale screen. Modals require a decision, and a decision costs a second the cashier doesn't have.

### 5.4 Signature element

**The sync pill.** Persistent, top-right, on every screen.

It's the product's entire thesis made visible: the shop keeps running, the app is honest about what's happening, nothing is lost. It's also the thing you point at during the demo when you switch the wifi off. Everything else in the UI should be quiet enough that the pill is the one element people remember.

---

## 6. Scope discipline

### v1 — build exactly this

- Products: add, edit, barcode, price, cost, reorder level
- Sale: search or scan, cart, quantity, discount, cash/Telebirr, complete
- Receipt: print at 80mm, reprint from history
- Stock: on-hand from movements, restock entry, adjustment with reason
- Reports: today's sales, this week, low stock, top products, gross profit
- Sync: full push/pull with honest status
- Owner view: read-only dashboard on phone
- PIN lock per cashier

### v1 — refuse all of this

Multi-branch. Supplier management. Accounting export. Customer accounts and credit ledgers. Loyalty. Multi-currency. Purchase orders. Expiry tracking. Barcode label printing. Staff scheduling. Any AI feature whatsoever.

Every one of these is a real thing a shop owner will ask for in the first meeting. The correct answer is "yes, that's phase two" — because a finished v1 that does six things flawlessly sells, and an unfinished v1 that half-does twenty things does not. You already know this failure mode; the mesh chat project worked because it had ten bounded sessions.

Write the refuse list into `CLAUDE.md`. Claude Code will otherwise happily help you build all of it.

---

## 7. Testing the thing that's hard to test

Sync bugs don't appear on one device. Add these as real tests, not manual checks:

1. **Two-device concurrent sale.** Two browser profiles, both offline, both sell the last unit. Sync both. Assert `SUM(qty_delta) = -2` and both sales exist.
2. **Interrupted push.** Kill the network mid-drain. Assert no duplicates after reconnect, outbox drains to zero.
3. **Clock skew.** Set one device's clock 5 minutes fast. Assert no rows are skipped on pull.
4. **Cold start with backlog.** 200 queued sales, then reconnect. Assert it drains in batches without freezing the UI.
5. **Void after sync.** Void a sale that has already synced. Assert compensating movements land and stock returns to correct.

Test 1 is the one that matters. If it passes, your data model is sound. Run it after session 6 and again before every demo.

---

## 8. Deployment

```
main   → Vercel production
        Supabase project: suq-prod
        env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

RLS on from the first migration, not bolted on later. Every table gets:

```sql
alter table sales enable row level security;

create policy "shop members read own shop"
  on sales for select
  using (shop_id in (
    select shop_id from shop_members where user_id = auth.uid()
  ));

create policy "shop members insert own shop"
  on sales for insert
  with check (shop_id in (
    select shop_id from shop_members where user_id = auth.uid()
  ));
```

No update or delete policy on append-only tables — the database itself enforces immutability. That's not paranoia; it means a bug in your client code cannot corrupt history.

**Secrets:** service-role key never touches the client bundle. Only the anon key ships. You've had an exposed secret before — set up `git-secrets` or a pre-commit hook in session 0 and don't think about it again.

---

## 9. Business shape

| Tier | Price | Contents |
|---|---|---|
| አነስተኛ / Small | **500 ETB/mo** | 1 device, 1 user, up to 500 products |
| መደበኛ / Standard | **1,200 ETB/mo** | 3 devices, cashier accounts, owner dashboard, reports |
| Setup | **2,500 ETB** one-off | Install, load their product list, 2 hours of training |

The setup fee matters more than it looks. It pays for the genuinely tedious part — typing in their existing inventory — and a client who has paid to onboard is a client who will actually use the thing. Free onboarding gets you a dead account in six weeks.

Your infrastructure floor is about $45/month (Vercel Pro + Supabase Pro). Two shops on Standard covers it. Everything past that is margin, and margin that doesn't move when usage grows, because there is no per-transaction cost anywhere in this system.

Your first target is Rowda Supermarket. You have an unfinished website thread there. Reopening it with "I built something for shops like yours, can I show you for ten minutes?" is a far stronger opening than an apology about the website.
