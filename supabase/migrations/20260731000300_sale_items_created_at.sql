-- sale_items had no timestamp, so pull had no watermark to filter it by and
-- would have had to re-read every line item on every pull. It is append-only
-- like sales and stock_movements, so it gets the same created_at watermark.
--
-- The default exists only so the column can be added NOT NULL; the client
-- always sends an explicit value, copied from its parent sale.

alter table public.sale_items
  add column created_at timestamptz not null default now();

create index sale_items_shop_created_idx on public.sale_items (shop_id, created_at);
