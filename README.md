# ሱቅ / Suq — Offline-First POS & Inventory

A point-of-sale and stock system for small shops that **keeps working when the internet and the power go out**, then reconciles cleanly when they come back.

Built for Ethiopian retail: Amharic-first UI, ETB pricing, thermal receipts, runs on a cheap Android tablet.

---

## What's in this pack

| File | What it's for | Who reads it |
|---|---|---|
| `README.md` | You are here. Start-to-finish orientation. | You |
| `BUILD_GUIDE.md` | Architecture, data model, sync design, design system. The reference you keep open. | You |
| `CLAUDE.md` | Drop this in the repo root. Claude Code reads it automatically every session. | Claude Code |
| `CLAUDE_CODE_PROMPTS.md` | Ten copy-paste session prompts, in order. | You → Claude Code |
| `PROJECT_AMHARIC.md` | The project explained in Amharic — both a client pitch and a technical overview. | You + clients |
| `DEMO_SCRIPT.md` | The 90-second demo that wins the meeting. Amharic + English. | You |

---

## Before you touch Claude Code

**Move these files into your project folder first.** Files created in a Claude chat session are not visible to Claude Code — it only sees your local filesystem. So:

```bash
mkdir suq && cd suq
# copy this whole pack into ./docs/, and CLAUDE.md into the root
mkdir docs
mv ~/Downloads/BUILD_GUIDE.md docs/
mv ~/Downloads/CLAUDE_CODE_PROMPTS.md docs/
mv ~/Downloads/PROJECT_AMHARIC.md docs/
mv ~/Downloads/DEMO_SCRIPT.md docs/
mv ~/Downloads/CLAUDE.md .
git init && git add -A && git commit -m "docs: build pack"
```

Then open the folder in VS Code and start Claude Code from the integrated terminal.

---

## The stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | You already know it |
| Styling | Tailwind CSS v4 | Fast, and the design tokens map cleanly |
| Local database | Dexie 4 (IndexedDB) + `dexie-react-hooks` | The actual source of truth. `useLiveQuery` gives reactive UI for free |
| Cloud database | Supabase Postgres | You already know it; free tier fits |
| Offline shell | Serwist (`@serwist/next`) | The maintained PWA plugin that actually supports Next 15 |
| Barcode | USB scanner (acts as a keyboard) + `@zxing/browser` for camera | USB path needs zero code |
| Receipts | CSS `@page` at 80mm, then optional Web Bluetooth ESC/POS | Print works on day one |
| Deploy | Vercel | You already know it |

**Runtime cost: zero.** No LLM calls, no embeddings, no per-transaction API. This is a CRUD app with a clever sync layer, and that is exactly the point — it means you can charge a monthly fee with no cost floor eating it.

---

## The ten build sessions

Each one is a self-contained Claude Code session with a definition of done. Don't skip ahead; sessions 5 and 6 depend on 1 being correct.

```
0  Scaffold, design tokens, app shell
1  Local database — Dexie schema, repositories, seed data      ← the foundation
2  Products — list, add, edit, barcode, low-stock flag
3  Sale screen — search, cart, keypad, checkout                ← the demo
4  Receipt — 80mm print layout, Amharic, reprint
5  Supabase — schema, RLS, migrations
6  Sync engine — outbox drain, pull, status pill               ← the magic
7  Reports — today's sales, low stock, top products, profit
8  PWA + PIN lock + polish
9  Demo seed data + rehearsal
```

Realistically: sessions 0–4 in a focused weekend, 5–7 the following one, 8–9 in an evening. You have a demo-ready product in about two weeks of part-time work.

---

## The one architectural idea that matters

Everything else is ordinary. This is not:

> **Never sync stock quantities. Sync stock *movements*.**

If two devices are offline and both sell the last case of water, and each syncs `stock_qty = 11`, one device's sale silently vanishes. Last-write-wins destroys data.

If instead each device appends `{product, qty_delta: -1}` and stock on hand is `SUM(qty_delta)`, both sales survive and the arithmetic is correct no matter what order they arrive in. Append-only rows commute. Absolute values don't.

The same principle covers sales (immutable, append-only; a mistake becomes a `void` row, never a deletion) and gives you an audit trail as a free side effect.

`BUILD_GUIDE.md` develops this properly. If you internalize one thing before opening Claude Code, make it this.

---

## Two honest cost warnings

Neither is a blocker today. Both become real the moment a client pays you.

**Vercel Hobby is non-commercial.** Fine for demos and your own testing. A paying client puts you on Pro at $20/month. Budget for it, or self-host on a small VPS.

**Supabase free projects pause after 7 days of inactivity.** You've been bitten by this before. During the build it's an annoyance; under a live shop it's an outage. For a real deployment, that's $25/month — which is why the pricing in the Amharic doc starts at 500 ETB/month per shop. Two shops covers your infrastructure. The third is profit.

---

## What "done" looks like

Not a feature list — a moment. You hand a shop owner a tablet. They ring up three items. You reach over and switch off the wifi mid-sale. They keep selling. You switch it back on and the sync pill counts down to zero while their phone shows the same sales appearing in the owner dashboard.

Build toward that moment. Cut anything that doesn't serve it.
