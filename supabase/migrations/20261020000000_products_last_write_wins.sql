-- Last-write-wins for products, enforced by the server (ROADMAP item 15).
--
-- products is the one table that is edited rather than appended to, and the
-- tills already resolve it by updated_at (lib/sync/apply.ts keeps the higher
-- one). The server did not: a push is a plain upsert, so an edit made offline
-- at 09:00 and pushed at 11:00 overwrote the 10:00 edit another till had
-- already pushed. The owner dashboard reads the server, and every till that
-- had not seen the 10:00 edit yet would never get it.
--
-- A BEFORE UPDATE trigger that skips the update (returns null) when the
-- incoming row is not newer. Skipping, rather than returning the old row,
-- also stops the received_at trigger that fires after this one (triggers run
-- in name order), so a refused edit does not look like a fresh row to every
-- till's next pull. The till that pushed the stale edit converges on its next
-- pull: its own apply keeps the newer server row.
--
-- Equal timestamps are skipped too: that is the same edit pushed twice (a
-- retry after a lost response), and apply.ts also keeps the local row on a tie.
--
-- Additive only: one function, one trigger. No data is changed.

create function private.products_keep_newer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  return null;
end;
$$;

revoke all on function private.products_keep_newer() from public;

create trigger products_last_write_wins
  before update on public.products
  for each row
  when (new.updated_at <= old.updated_at)
  execute function private.products_keep_newer();
