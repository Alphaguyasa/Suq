-- Pull sets last_pull_at from the SERVER's clock, never Date.now(). A tablet
-- whose clock runs fast would otherwise skip a window of rows on every pull,
-- silently and permanently (BUILD_GUIDE 4.2).
--
-- Not SECURITY DEFINER: it reads nothing and needs no elevated rights.

create function public.server_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

revoke all on function public.server_now() from public;
grant execute on function public.server_now() to authenticated, service_role;
