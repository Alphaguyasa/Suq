# NEEDS APPROVAL — decisions for alpha

Anything that needs the owner's decision, money, or an action only they can take. Newest first. When an item is
resolved, move it to **Resolved** with the date and outcome.

## Open

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

_(none yet)_
