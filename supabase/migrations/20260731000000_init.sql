-- Suq POS — cloud replica.
--
-- IndexedDB on the tablet is the source of truth. This is the replica
-- (BUILD_GUIDE section 2). Column names and types mirror lib/db/schema.ts
-- exactly, because the sync engine pushes rows verbatim.
--
-- Two rules this file enforces at the database level, not in client code:
--   1. Money is bigint cents. Never a float, never a numeric with scale.
--   2. sales, sale_items and stock_movements are append-only. There is no
--      UPDATE policy and no DELETE policy on them, so a bug in the client
--      cannot corrupt history even if it tries.
--
-- IDs are uuid with NO DEFAULT. The client generates every id with
-- crypto.randomUUID() before the row exists, which is what makes a retried
-- push idempotent (BUILD_GUIDE 4.1).

-- ---------------------------------------------------------------- shops ----

create table public.shops (
  id          uuid primary key,
  name        text        not null default '',
  name_am     text        not null default '',
  phone       text        not null default '',
  address     text        not null default '',
  created_at  timestamptz not null default now()
);

create table public.shop_members (
  shop_id     uuid        not null references public.shops (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  role        text        not null default 'cashier' check (role in ('owner', 'cashier')),
  created_at  timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create index shop_members_user_idx on public.shop_members (user_id);

-- ------------------------------------------------------------- products ----

create table public.products (
  id             uuid        primary key,
  shop_id        uuid        not null references public.shops (id) on delete cascade,
  name           text        not null,
  name_am        text        not null,
  barcode        text,
  unit           text        not null check (unit in ('pcs', 'kg', 'l', 'pack')),
  cost_price     bigint      not null check (cost_price >= 0),
  sell_price     bigint      not null check (sell_price >= 0),
  reorder_level  numeric     not null default 0,
  is_active      boolean     not null default true,
  updated_at     timestamptz not null,
  deleted_at     timestamptz
);

create index products_shop_barcode_idx on public.products (shop_id, barcode);
create index products_shop_updated_idx on public.products (shop_id, updated_at);

-- ---------------------------------------------------------------- sales ----
--
-- synced_at is deliberately absent: it is local-only bookkeeping and is
-- stripped on push (BUILD_GUIDE 3.2).
--
-- voided_by exists for parity with the client type but is never written —
-- setting it would be an UPDATE on an append-only table. Voided status is
-- derived from the void row's voids_sale_id.

create table public.sales (
  id              uuid        primary key,
  shop_id         uuid        not null references public.shops (id) on delete cascade,
  device_id       uuid        not null,
  receipt_no      text        not null,
  subtotal        bigint      not null,
  discount        bigint      not null default 0,
  total           bigint      not null,
  payment_method  text        not null check (payment_method in ('cash', 'telebirr', 'card', 'credit')),
  cashier_name    text        not null default '',
  voided_by       uuid,
  voids_sale_id   uuid,
  cash_received   bigint,
  created_at      timestamptz not null
);

create index sales_shop_created_idx on public.sales (shop_id, created_at);
create index sales_shop_receipt_idx on public.sales (shop_id, receipt_no);
create index sales_voids_idx on public.sales (voids_sale_id) where voids_sale_id is not null;

-- ----------------------------------------------------------- sale_items ----

create table public.sale_items (
  id             uuid   primary key,
  shop_id        uuid   not null references public.shops (id) on delete cascade,
  sale_id        uuid   not null,
  product_id     uuid   not null,
  name_snapshot  text   not null,
  unit_price     bigint not null,
  qty            numeric not null,
  line_total     bigint not null
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_shop_product_idx on public.sale_items (shop_id, product_id);

-- ------------------------------------------------------ stock_movements ----

create table public.stock_movements (
  id          uuid        primary key,
  shop_id     uuid        not null references public.shops (id) on delete cascade,
  product_id  uuid        not null,
  qty_delta   numeric     not null,
  reason      text        not null check (reason in ('sale', 'purchase', 'adjustment', 'return', 'damage', 'opening')),
  ref_id      uuid,
  note        text,
  created_at  timestamptz not null,
  device_id   uuid        not null
);

create index stock_movements_shop_created_idx on public.stock_movements (shop_id, created_at);
create index stock_movements_shop_product_idx on public.stock_movements (shop_id, product_id);

-- On the missing foreign keys ------------------------------------------------
--
-- sale_items.sale_id, sale_items.product_id, stock_movements.product_id,
-- stock_movements.ref_id and sales.voids_sale_id are NOT foreign keys, on
-- purpose.
--
-- Push drains the outbox in batches and groups by table (BUILD_GUIDE 4.1).
-- The order in which those per-table requests land is not guaranteed, so a
-- foreign key would let a batch arrive "wrong way round" and be rejected
-- permanently — the retry would fail identically every time, and the till
-- would silently stop syncing. That is precisely the failure this
-- architecture exists to avoid.
--
-- Referential integrity is instead guaranteed upstream: every one of these
-- rows is written inside a single IndexedDB transaction by localWrite(), so
-- a sale_item without its sale cannot be created in the first place.
--
-- shop_id IS a foreign key, because shops are provisioned at setup and never
-- arrive through the outbox.

-- --------------------------------------------- owner dashboard: stock ------
--
-- security_invoker so the querying user's RLS applies, rather than the
-- view owner's. Without it this view would leak stock across shops.

create view public.stock_on_hand
with (security_invoker = on) as
  select
    shop_id,
    product_id,
    sum(qty_delta) as on_hand
  from public.stock_movements
  group by shop_id, product_id;

-- ------------------------------------------------------------------ RLS ----

-- Stable helper so each policy is one clear line. security definer avoids
-- recursive RLS evaluation on shop_members itself.
create function public.is_shop_member(target_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = target_shop
      and shop_members.user_id = auth.uid()
  );
$$;

alter table public.shops           enable row level security;
alter table public.shop_members    enable row level security;
alter table public.products        enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.stock_movements enable row level security;

-- shops and shop_members are read-only to clients. Provisioning a shop or
-- adding a member is a service-role operation (see supabase/seed.sql), so a
-- signed-in user cannot enrol themselves into somebody else's shop.
create policy "members read their shop"
  on public.shops for select
  to authenticated
  using (public.is_shop_member(id));

create policy "members read their shop roster"
  on public.shop_members for select
  to authenticated
  using (public.is_shop_member(shop_id));

-- products: last-write-wins, so members may update. No delete policy —
-- removal is a soft delete, which is an update to deleted_at.
create policy "members read products"
  on public.products for select
  to authenticated
  using (public.is_shop_member(shop_id));

create policy "members insert products"
  on public.products for insert
  to authenticated
  with check (public.is_shop_member(shop_id));

create policy "members update products"
  on public.products for update
  to authenticated
  using (public.is_shop_member(shop_id))
  with check (public.is_shop_member(shop_id));

-- Append-only tables: SELECT and INSERT only, for all three. The absence of
-- an UPDATE or DELETE policy is the point of this migration.
create policy "members read sales"
  on public.sales for select
  to authenticated
  using (public.is_shop_member(shop_id));

create policy "members insert sales"
  on public.sales for insert
  to authenticated
  with check (public.is_shop_member(shop_id));

create policy "members read sale items"
  on public.sale_items for select
  to authenticated
  using (public.is_shop_member(shop_id));

create policy "members insert sale items"
  on public.sale_items for insert
  to authenticated
  with check (public.is_shop_member(shop_id));

create policy "members read stock movements"
  on public.stock_movements for select
  to authenticated
  using (public.is_shop_member(shop_id));

create policy "members insert stock movements"
  on public.stock_movements for insert
  to authenticated
  with check (public.is_shop_member(shop_id));
