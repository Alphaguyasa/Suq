-- One demo shop with a member.
--
-- Run with the service role (Supabase SQL editor, or `supabase db reset`).
-- shops and shop_members have no client INSERT policy on purpose: a signed-in
-- user must not be able to enrol themselves into somebody else's shop, so
-- provisioning is deliberately an out-of-band operation.
--
-- Idempotent — safe to run repeatedly.

insert into public.shops (id, name, name_am, phone, address)
values (
  '5c9a1000-0000-4000-8000-000000000001',
  'Rowda Supermarket',
  'ሮዳ ሱፐርማርኬት',
  '+251 91 100 0000',
  'ቦሌ፣ አዲስ አበባ'
)
on conflict (id) do nothing;

-- Links the earliest-registered auth user as owner. If nobody has signed up
-- yet this is a no-op; sign up, then run the file again.
insert into public.shop_members (shop_id, user_id, role)
select '5c9a1000-0000-4000-8000-000000000001', users.id, 'owner'
from auth.users as users
order by users.created_at
limit 1
on conflict (shop_id, user_id) do nothing;

select
  (select count(*) from public.shops) as shops,
  (select count(*) from public.shop_members) as members;
