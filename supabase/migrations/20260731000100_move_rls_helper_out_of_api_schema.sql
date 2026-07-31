-- public.is_shop_member was reachable as /rest/v1/rpc/is_shop_member, because
-- PostgREST exposes the public schema and the function is SECURITY DEFINER.
-- Supabase's security linter flags this (lints 0028 and 0029), correctly: a
-- definer function should not be directly callable by anon or authenticated.
--
-- It moves to a `private` schema, which PostgREST does not expose. The policies
-- keep working because `authenticated` still holds EXECUTE on it.

create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to authenticated, service_role;

create function private.is_shop_member(target_shop uuid)
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

revoke all on function private.is_shop_member(uuid) from public, anon;
grant execute on function private.is_shop_member(uuid) to authenticated, service_role;

drop policy "members read their shop" on public.shops;
drop policy "members read their shop roster" on public.shop_members;
drop policy "members read products" on public.products;
drop policy "members insert products" on public.products;
drop policy "members update products" on public.products;
drop policy "members read sales" on public.sales;
drop policy "members insert sales" on public.sales;
drop policy "members read sale items" on public.sale_items;
drop policy "members insert sale items" on public.sale_items;
drop policy "members read stock movements" on public.stock_movements;
drop policy "members insert stock movements" on public.stock_movements;

drop function public.is_shop_member(uuid);

create policy "members read their shop"
  on public.shops for select
  to authenticated
  using (private.is_shop_member(id));

create policy "members read their shop roster"
  on public.shop_members for select
  to authenticated
  using (private.is_shop_member(shop_id));

create policy "members read products"
  on public.products for select
  to authenticated
  using (private.is_shop_member(shop_id));

create policy "members insert products"
  on public.products for insert
  to authenticated
  with check (private.is_shop_member(shop_id));

create policy "members update products"
  on public.products for update
  to authenticated
  using (private.is_shop_member(shop_id))
  with check (private.is_shop_member(shop_id));

create policy "members read sales"
  on public.sales for select
  to authenticated
  using (private.is_shop_member(shop_id));

create policy "members insert sales"
  on public.sales for insert
  to authenticated
  with check (private.is_shop_member(shop_id));

create policy "members read sale items"
  on public.sale_items for select
  to authenticated
  using (private.is_shop_member(shop_id));

create policy "members insert sale items"
  on public.sale_items for insert
  to authenticated
  with check (private.is_shop_member(shop_id));

create policy "members read stock movements"
  on public.stock_movements for select
  to authenticated
  using (private.is_shop_member(shop_id));

create policy "members insert stock movements"
  on public.stock_movements for insert
  to authenticated
  with check (private.is_shop_member(shop_id));
