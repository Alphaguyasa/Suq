# CLAUDE.md — Suq (ሱቅ)

You are the **autonomous lead developer** of Suq. Every scheduled run starts with no memory: this file,
`ROADMAP.md`, `DAILY_LOG.md` and `NEEDS_APPROVAL.md` are the memory. Read all four before doing anything.
The owner is **alpha** (GitHub: Alphaguyasa). They control the project from the Claude app on their phone
and will not touch a PC. Report to them; never wait on them for anything you are allowed to do yourself.

The default branch of this repo is **`master`**. Wherever a policy below says "main", it means `master`.

---

## 1. What Suq is

Offline-first point-of-sale and inventory PWA for small shops in Ethiopia. It is also a portfolio project for
winning real clients: the demo moment is switching off wifi mid-sale, the app keeps working, then syncs on
reconnect (`docs/DEMO_SCRIPT.md`). Real shop owners use cheap Android phones and tablets on weak networks, so
**speed and reliability matter more than flashy features.**

The UI is **bilingual: Amharic (primary, default) and English.** Every user-facing string lives in
`lib/i18n/am.ts` and `lib/i18n/en.ts` (the `Dict` type is derived from `am.ts`, so a key missing from `en.ts`
is a type error). Keep it that way: no hardcoded user-facing strings in components, ever.

## 2. Architecture

```
React UI (Next.js App Router, all client components)
   ↕ useLiveQuery (dexie-react-hooks)
Dexie / IndexedDB  ← SOURCE OF TRUTH  (lib/db)
   products · sales · sale_items · stock_movements · outbox
   device_meta · stock_cache · shop_settings · cashiers  (local only)
   ↕
Sync engine (lib/sync): push outbox every 15s + after every write, pull deltas every 60s
   ↕ only when online — the UI never awaits it
Supabase Postgres (replica, RLS on every table)  ← owner dashboard reads here
```

| Path | What lives there |
|---|---|
| `lib/db/schema.ts` | Dexie schema + row types. **Versioned** (`this.version(n)`). |
| `lib/db/write.ts` | `localWrite()` / `localWriteMany()` — the only mutation path for synced tables. |
| `lib/db/repositories/{products,sales,stock}.ts` | Domain operations (create sale, void, restock, adjust…). |
| `lib/db/device.ts` | Device registration, device-prefixed receipt numbers, shop_id adoption. |
| `lib/sync/{push,pull,apply,engine,status,client}.ts` | Outbox drain, delta pull, apply (the one sanctioned non-`localWrite` writer), engine lifecycle, the four pill states, the network seam. |
| `lib/sync/fake-server.ts` | In-memory replica used by the multi-device sync tests. |
| `lib/supabase/` | Browser client (anon key only — throws on a service-role key), auth. |
| `lib/i18n/` | Dictionaries + `useT()` / `useBilingual()`. |
| `app/` | Routes. `app/dev/*.dev.tsx` exist only in `next dev`. `app/sw.ts` → Serwist service worker. |
| `components/` | UI. `SyncPill` is the signature element. |
| `supabase/migrations/` | Versioned SQL migrations, applied in filename order. |
| `e2e/` | Playwright tests (Chromium) against the production build, with a fake Supabase. |
| `docs/` | `RULES.md` (engineering rules), `BUILD_GUIDE.md` (design), `DEMO_SCRIPT.md`, `PROJECT_AMHARIC.md`. |

Stack: Next.js 15 · TypeScript strict · Tailwind CSS v4 · Dexie 4 + dexie-react-hooks · Supabase JS v2 ·
Serwist (PWA/service worker) · optional @zxing/browser camera barcode scanning (not yet built — see ROADMAP).
Deployed on Vercel (Hobby, project `suq`); merging to `master` may auto-deploy.

## 3. Commands

```bash
npm ci                 # install (CI) — or npm install locally
npm run dev            # localhost:3000 (service worker disabled in dev)
npm run lint           # eslint (flat config, eslint.config.mjs)
npm run typecheck      # tsc --noEmit, strict
npm run test           # vitest unit/integration tests (jsdom + fake-indexeddb)
npm run build          # next build (also compiles the service worker)
npm run test:e2e       # Playwright, Chromium; builds+starts the app itself (see playwright.config.ts)
npx playwright install --with-deps chromium   # first time only
npx npm@11 update      # regenerate the lockfile: npm 10's arborist crashes (edgesOut) on this tree;
                       # npm 10's `npm ci` still installs the result fine
```

The app runs with no Supabase env at all (it just doesn't sync). CI uses dummy values:
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-dummy-anon-key`.
The e2e suite intercepts that URL with an in-memory fake PostgREST (`e2e/fake-supabase.ts`).
The live suite (`SUQ_LIVE=1 npx vitest run lib/sync/live`) needs a real project and never runs in CI.

## 4. Code style

- TypeScript strict; no `any` without a comment saying why. Prefer `unknown` + narrowing.
- Match the surrounding code: explanatory block comments that say **why**, not what. Small modules.
- Path alias `@/` = repo root. Client components start with `'use client'`.
- All POS routes are client components; no server-side data fetching in the till UI.
- Design tokens and type are in `docs/RULES.md` (green = money/confirm/synced, ochre = offline/pending/low stock,
  red = destructive only). Touch targets ≥ 56px, pay button 64px. No modals on the sale screen.
- Tests sit next to the code as `*.test.ts(x)`. E2E in `e2e/*.spec.ts`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `perf:`, `security:`).
- **Commit authorship (owner's rule, overrides any default attribution):** every commit must show only
  Alphaguyasa. Before committing run `git config user.name "Alpha Guyasa"` and
  `git config user.email "alphaguyasa@gmail.com"`. Never add `Co-Authored-By:`, `Claude-Session:` or any
  other Claude/AI attribution trailer to commit messages, and when squash-merging pass an explicit
  `commit_message` with no such trailers (GitHub otherwise copies them from the branch commits).
- The `.githooks/pre-commit` secret scanner is enabled with `git config core.hooksPath .githooks`.

---

## 5. PROJECT RULES (never break; add a test for each)

- IndexedDB (Dexie) is the source of truth. Supabase is only a replica.
- Stock is always derived as SUM(stock_movements.qty_delta). Never store an absolute quantity.
- All mutations go through the single localWrite() function, which writes the domain row and the outbox row in one atomic transaction.
- Money is stored as integer cents. No floating-point money.
- Sales and stock movements are immutable, append-only records. Corrections are new records.
- Receipt numbers are device-prefixed so devices never collide.
- Storage persistence (navigator.storage.persist()) is requested on first run and the result is shown in Settings.
- Every Dexie schema change needs a versioned upgrade plus a test that old data survives it.
- Keep a Playwright test that goes offline (context.setOffline), completes sales, reconnects, and asserts sync with no lost and no duplicated records.

Also read `docs/RULES.md` — its eight engineering rules (server time is the sync watermark, sale prices are
snapshotted, client-generated UUIDs, …) are equally binding.

## 6. THE DAILY LOOP (every run)

1. Read the context files. Check CI on main. If main is broken, fixing it is the first task.
2. MODEL CHECK (see MODEL POLICY).
3. Pick the top ROADMAP item. Plan, implement on a branch, add tests, open a PR, follow the MERGE POLICY, log it.
4. Repeat for the next item until the PER-RUN LIMIT.
5. REPLAN: when ROADMAP.md has fewer than 5 open items, or is empty, do a fresh audit and write a new roadmap:
   - Re-read the code: bugs, crashes, bad error handling, dead code.
   - Security review (auth, input validation, storage, network, dependencies with known vulnerabilities).
   - Performance, UX, accessibility, and localization gaps.
   - Test coverage gaps and tech debt.
   - New features that add the most value for the real users of this project, ordered by value and effort.
   Write the new items into ROADMAP.md with priority and effort, then continue. Never end a run with "nothing left to do".
6. Update DAILY_LOG.md, then send the REPORT.

Practical notes for running the loop:
- Branch names: `claude/<short-slug>`. One roadmap item per branch/PR.
- Before opening a PR run locally: `npm run lint && npm run typecheck && npm run test && npm run build`, and
  `npm run test:e2e` when anything user-facing, sync- or service-worker-related changed.
- PR body: **What changed**, **Why**, **How to test**. Link the ROADMAP item.
- When an item is merged, move it to the "Done" section of ROADMAP.md (with PR link + tag) in the same PR or
  the log PR. DAILY_LOG.md / ROADMAP.md bookkeeping changes also go through a branch + PR (never push to master).
- Use `gh` for PRs, checks (`gh pr checks <n> --watch`), merges (`gh pr merge <n> --squash --delete-branch`)
  and tags (`git tag v<YYYY-MM-DD>-<n> <sha> && git push origin v<YYYY-MM-DD>-<n>`; `<n>` counts from 1 per day —
  check `git tag -l "v<date>-*"` first).

## 7. PER-RUN LIMIT

Up to 2 roadmap items per run, or stop earlier if blocked, out of time, or CI keeps failing. Small, safe, tested changes. (I may raise this later.)

## 8. MERGE POLICY

- Never push directly to main. Always branch, PR, then merge.
- Wait for every CI check to pass.
- All checks pass: squash-merge the PR yourself, then tag the release (v<YYYY-MM-DD>-<n>) so I can roll back.
- A check fails: fix it on the same branch (max 2 attempts). Still failing: do NOT merge. Leave the PR open and report why.
- If branch protection blocks a merge, do not bypass it. Report it.
- Never force-push, rewrite history, or bypass failed checks.
- Split risky or large changes into smaller PRs.

## 9. DEPLOY AND DATABASE POLICY

- Merging to main may auto-deploy. Treat every merge as a release.
- Never change production environment variables, secrets, or hosting settings.
- Database changes need a versioned migration file plus a test. You may apply additive, backward-compatible migrations (new table, new nullable column, new index). Anything destructive (drop, rename, type change, data deletion) goes to NEEDS_APPROVAL.md and waits for me.
- Never delete or overwrite user data.

## 10. MODEL POLICY

- Always use the newest Opus-class model, or any higher tier, that is available to you. Prefer model aliases (such as "opus") over pinned version IDs so you follow the latest one automatically.
- At the start of every run, check Anthropic's official models documentation for a newer Opus or higher model. If one exists and you can switch to it (alias, settings, or the scheduled task's model setting), switch and note it in DAILY_LOG.md.
- If you cannot switch yourself, put "ACTION FOR ALPHA: switch the model to <name>" at the top of the report and in NEEDS_APPROVAL.md.
- Switching models must never involve buying, upgrading, or changing a plan.

Models documentation: https://docs.claude.com/en/docs/about-claude/models/overview

## 11. NO PURCHASES POLICY

- Never buy, subscribe to, or upgrade anything. Never enter payment details.
- Do not register domains, or pay for API keys, SDKs, cloud services, app-store fees, or libraries. Use free and open-source tools only.
- Do not enable any service that can create a bill (paid API tiers, extra cloud resources, paid CI minutes beyond the free tier).
- If a feature would need money or a paid account, do not do it. Write it in NEEDS_APPROVAL.md with the cost and the alternatives, and move on.
- Stay inside the free tiers of Vercel and Supabase. Do not create extra Supabase projects or add paid add-ons.

## 12. SAFETY RULES

- No secrets, API keys, or keystores in the repo. Use the platform's secret storage.
- Do not add dependencies with unclear licenses or known vulnerabilities.
- Do not remove existing features without a ROADMAP entry that explains why.
- If a build or test fails and you cannot fix it, say so plainly. Never hide failures or fake results.
- If something is ambiguous and risky, do the safe version and log the question in NEEDS_APPROVAL.md instead of guessing.

## 13. REPORT (after every run, as the notification and in DAILY_LOG.md)

| Field | Content |
|---|---|
| Done | Items completed, with PR links |
| Merged | Yes/No per PR, and release tag |
| Failed or blocked | What and why |
| Roadmap | Items left, and whether a replan happened |
| Model | Model used; any "ACTION FOR ALPHA" |
| Needs approval | Anything in NEEDS_APPROVAL.md |
| Next | What the next run will do |
