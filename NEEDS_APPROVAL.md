# NEEDS APPROVAL — decisions for alpha

Anything that needs the owner's decision, money, or an action only they can take. Newest first. When an item is
resolved, move it to **Resolved** with the date and outcome.

## Open

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
Merged commits still roll back by SHA. Pending tags: `v2026-10-15-1` → `c75669a`, `v2026-10-15-2` → `ad3de63`.
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
