# NEEDS APPROVAL — decisions for alpha

Anything that needs the owner's decision, money, or an action only they can take. Newest first. When an item is
resolved, move it to **Resolved** with the date and outcome.

## Open

### DECISION FOR ALPHA: two features that `docs/RULES.md` rules out for v1 (added 2026-10-22)
Both were proposed by runs, not by you, and RULES.md says no, so neither will be built until you answer:
1. **Camera barcode scanning** (ROADMAP 12). RULES.md: "no camera scanning in v1 and no scanner library". Useful for
   shops without a USB scanner. If yes, the plan is the browser's built-in `BarcodeDetector` (Chrome on Android,
   free, no new library), with the free MIT/Apache @zxing/browser library only as a fallback. Reply "yes camera" or "no".
2. **Credit (ዱቤ) customer ledger** (ROADMAP 33). RULES.md lists customer credit accounts as out of scope. A credit
   sale today records no customer, so nobody can see who owes what. Reply "yes credit" or "no".
No cost either way.

### ACTION FOR ALPHA: apply migration `20261020000000_products_last_write_wins.sql` too (added 2026-10-20)
Merged in PR #19. Additive only: one function in `private` and one trigger on `products`; no data changed. It makes
the server keep the newer product edit when an older offline edit is pushed late. Apply it **after** the
`received_at` one below, the same way (SQL Editor → paste → Run), or reconnect the connector and a run will do both.

### ACTION FOR ALPHA: apply migration `20261016000000_received_at.sql` to the Suq project (added 2026-10-16)
Merged in PR #9. It is additive only: new `received_at` columns with a default, one trigger function in
`private`, four triggers and four indexes. Nothing is dropped, renamed or deleted. This run could not apply it
because the Supabase connector still cannot see the Suq project (see the next item). Until the migration is
applied, tills keep using the old filter. That filter still misses offline sales another till pushes late.
Once applied, each till's next pull re-reads its shop's history once and recovers those rows.
How to apply (free, ~1 minute): Supabase dashboard → Suq project → SQL Editor → paste the file → Run.
Alternatively, reconnect the connector and the next run will apply it.

### ACTION FOR ALPHA: connect the Suq Supabase project to the routine (added 2026-10-15)
On 2026-10-15 sign-in on https://suq-theta.vercel.app failed with "Failed to fetch" because the Suq Supabase
project was **paused** (free tier, 7 days idle). Alpha restored it by pausing `erko-staging` (free plan: max 2
active projects per organization). The Supabase connector these runs use only sees the other organization
(`not-alone-scripture`, `erko-staging`), **not the Suq project**, so runs cannot apply the additive migration
ROADMAP item 3 needs or check whether the project is paused. Fix: in the Claude app, reconnect the Supabase
connector with access to the organization that owns the Suq project (free). Until then, item 3's migration
will be written and tested but left for alpha to apply. The project will pause again after 7 idle days — see
the hosting-cost item below.

### ACTION FOR ALPHA (optional): switch the routine's model to Claude Fable 5.1 (added 2026-10-15)
The models page lists **Claude Fable 5.1** (`claude-fable-5-1`) as a tier above Opus. CLAUDE.md §10 asks for
"the newest Opus-class model, or any higher tier". The routine uses alias `opus` (now Opus 5.5) and a run
cannot change its own model. If you want it: routine settings → model → Fable 5.1. Not a purchase, but it
uses more of your plan's usage per run than Opus. Staying on Opus is fine.

### Release tags cannot be pushed from scheduled runs (added 2026-10-15)
The cloud session's git proxy returns **403** on `git push origin <tag>`; it only allows the session branch.
Merged commits still roll back by SHA. Pending tags: `v2026-10-15-1` → `c75669a`, `v2026-10-15-2` → `ad3de63`,
`v2026-10-16-1` → `2c92d3b`, `v2026-10-16-2` → `943f9f0`, `v2026-10-18-1` → `204fb5f`, `v2026-10-18-2` → `7e19f07`,
`v2026-10-19-1` → `9ac3386`, `v2026-10-19-2` → `3356bd1`, `v2026-10-20-1` → `eccfdac`, `v2026-10-20-2` → `d3af6bd`,
`v2026-10-21-1` → `4d502b9`, `v2026-10-21-2` → `0d81145`, `v2026-10-22-1` → `3ec8d31`, `v2026-10-22-2` → `2044829`,
`v2026-10-23-1` → `1608538`, `v2026-10-23-2` → `e1efd21`, `v2026-10-24-1` → `6422211`, `v2026-10-24-2` → `88d5c26`, `v2026-10-26-1` → `89eaf6e`, `v2026-10-26-2` → `fd3fdbd`, `v2026-10-26-3` → `84c8908`, `v2026-10-26-4` → `da6578a`, `v2026-10-27-1` → `3c4c0e5`, `v2026-10-27-2` → `17042f7`, `v2026-10-28-1` → `b919b5d`, `v2026-10-28-2` → `f8fcd73`, `v2026-10-28-3` → `a2e3757`, `v2026-10-28-4` → `6aec552`, `v2026-10-29-1` → `a23fb33`, `v2026-10-29-2` → `e931bbe`.
Options: (a) allow tag pushes for the routine's GitHub access, or (b) accept SHAs as rollback points and drop
the tagging rule. Until then runs log the SHA instead.

### ACTION FOR ALPHA: finish the daily routine's settings (one-time, ~1 minute, free)
Routine **"Suq daily autonomous dev"** — https://claude.ai/code/routines/trig_01QtYEsG3ee6NtS952hJFkTM
(daily 07:00 Africa/Nairobi, model alias `opus`, Supabase connector attached so it may apply *additive*
migrations only, per CLAUDE.md §9).
1. Switch the routine to **"Automatically approve"** — scheduled runs have nobody to approve actions.
2. Turn **push notifications ON** for it (the API used to create it has no notification setting).
3. Make sure the Claude GitHub app has access to `Alphaguyasa/Suq` with push + PR rights, or the runs cannot open PRs.

### Recommended (free): protect `master` so CI must pass before merge
`master` currently has no branch protection. Turning on "Require status checks to pass" (check: *lint · typecheck ·
unit · build · e2e*) makes the merge policy enforced by GitHub, not just by the agent. Your call — repo settings
are yours; the agent will not change them.

### Hosting cost before the first paying client (money — decision only, nothing to do yet)
- **Vercel Hobby is non-commercial.** Serving a paying shop needs Vercel Pro (**$20/month**). Alternatives:
  Cloudflare Pages free tier (commercial use allowed; needs a deploy-config change), or Netlify free tier.
- **Supabase free projects pause after 7 days without activity.** For a live shop that is an outage of the
  sync/owner view (the till itself keeps working offline). Supabase Pro is **$25/month**. Free alternatives: a
  scheduled keep-alive ping (GitHub Actions cron hitting a cheap RPC once a day — free, but a grey area in
  Supabase's fair-use terms), or accept the pause for demo-only use.
- Nothing will be bought or changed. Decide when the first client signs.

## Resolved

- **2026-10-15 — Sign-in "Failed to fetch".** Cause: Suq Supabase project paused. Alpha paused `erko-staging`
  and restored Suq; sign-in works again.

_(none yet)_
