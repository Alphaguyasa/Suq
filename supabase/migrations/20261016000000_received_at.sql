-- Pull watermark in the SERVER's clock (ROADMAP item 3).
--
-- Pull's watermark comes from server_now(), but it used to filter rows on
-- created_at / updated_at, which the DEVICE stamps. A till offline at 09:50
-- pushes its sale at 10:05 still stamped 09:50; a till that pulled at 10:00
-- asks for "created_at > 10:00" and never receives it. Its history and stock
-- stay wrong for good.
--
-- received_at is when the server got the row, set by a trigger on every
-- insert and update, so the client cannot set it (and a slow tablet clock
-- cannot hide a row behind the watermark).
--
-- Additive only: new columns with a default, a trigger, indexes. Existing
-- rows read as received when this migration runs, so every till's first
-- received_at pull re-reads them once — which also recovers rows the old
-- filter skipped. Older app builds keep filtering on created_at and are
-- unaffected.
--
-- clock_timestamp(), not now(): now() is the start of the transaction and
-- would let a long upsert stamp itself further in the past. The client still
-- re-reads a two-minute window behind its watermark (PULL_OVERLAP_MS) for
-- rows stamped before, but committed after, a pull read server_now().

alter table public.products        add column received_at timestamptz not null default now();
alter table public.sales           add column received_at timestamptz not null default now();
alter table public.sale_items      add column received_at timestamptz not null default now();
alter table public.stock_movements add column received_at timestamptz not null default now();

create function private.stamp_received_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.stamp_received_at() from public;

create trigger products_received_at
  before insert or update on public.products
  for each row execute function private.stamp_received_at();

create trigger sales_received_at
  before insert or update on public.sales
  for each row execute function private.stamp_received_at();

create trigger sale_items_received_at
  before insert or update on public.sale_items
  for each row execute function private.stamp_received_at();

create trigger stock_movements_received_at
  before insert or update on public.stock_movements
  for each row execute function private.stamp_received_at();

-- Pull pages on (received_at, id) within a shop.
create index products_shop_received_idx        on public.products (shop_id, received_at, id);
create index sales_shop_received_idx           on public.sales (shop_id, received_at, id);
create index sale_items_shop_received_idx      on public.sale_items (shop_id, received_at, id);
create index stock_movements_shop_received_idx on public.stock_movements (shop_id, received_at, id);
