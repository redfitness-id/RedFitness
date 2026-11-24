begin;

set local lock_timeout = '5s';

-- Load supabase/inf03/inventory.sql and set the independently approved
-- environment-specific fingerprint in the same operator session.
lock table public.registrations, public.admin_profiles, public.clubs, public.classes,
  public.schedules, public.banners, public.page_content in access exclusive mode;

do $$
declare
  approved text := nullif(current_setting('rf.inf03_reviewed_inventory_md5', true), '');
begin
  if approved is null or approved !~ '^[0-9a-f]{32}$' then
    raise exception 'INF-03 requires an independently reviewed inventory fingerprint';
  end if;
  if to_regprocedure('pg_temp.inf03_inventory()') is null then
    raise exception 'INF-03 inventory helper must be loaded in this session';
  end if;
  if md5(pg_temp.inf03_inventory()::text) is distinct from approved then
    raise exception 'INF-03 inventory drift: review current metadata before any policy replacement';
  end if;
end
$$;

-- Replace only the inventory reconciled above. Required exceptions must be
-- represented in the reviewed migration before a fingerprint is approved.
-- Permissive policies combine with OR, so keeping an unmatched broad policy
-- would defeat the role checks below.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('registrations', 'admin_profiles', 'clubs', 'classes',
                        'schedules', 'banners', 'page_content')
  loop
    execute format('drop policy %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end
$$;

alter table public.admin_profiles enable row level security;
alter table public.registrations enable row level security;

revoke all privileges on public.admin_profiles, public.registrations
  from public, anon, authenticated;
grant select on public.admin_profiles to authenticated;
grant select on public.registrations to authenticated;

create policy rf_profile_read_own on public.admin_profiles
  for select to authenticated using (id = (select auth.uid()));

-- This helper exposes only a Boolean about the current signed-in user. Keep
-- this schema outside the Data API and keep its owner a trusted migration role.
create schema rf_security;
revoke all on schema rf_security from public;
grant usage on schema rf_security to authenticated;
create function rf_security.has_staff_role(allowed_roles text[])
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles
    where id = (select auth.uid()) and role::text = any(allowed_roles)
  );
$$;
revoke all on function rf_security.has_staff_role(text[]) from public;
grant execute on function rf_security.has_staff_role(text[]) to authenticated;

create policy rf_registrations_admin_read on public.registrations
  for select to authenticated
  using ((select rf_security.has_staff_role(array['admin'])));
do $$
declare
  table_name text;
  allowed_roles text[];
begin
  foreach table_name in array array['clubs', 'classes', 'schedules', 'banners', 'page_content']
  loop
    allowed_roles := case when table_name = 'schedules'
      then array['admin', 'schedule_manager'] else array['admin'] end;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to anon, authenticated', table_name);
    execute format('grant insert, update, delete on public.%I to authenticated', table_name);

    execute format('create policy rf_website_public_read on public.%I
      for select to anon, authenticated using (true)', table_name);
    execute format('create policy rf_website_staff_write on public.%I
      for all to authenticated
      using ((select rf_security.has_staff_role(%L::text[])))
      with check ((select rf_security.has_staff_role(%L::text[])))',
      table_name, allowed_roles, allowed_roles);
  end loop;
end
$$;

-- Direct revocation also needs to withstand inherited grants and any remaining
-- column grants. Abort rather than leave a client able to bypass this split.
do $$
declare
  client_role text;
  table_name text;
  operation text;
  allowed boolean;
begin
  foreach client_role in array array['anon', 'authenticated'] loop
    if exists (
      select 1 from pg_roles r where (rolsuper or rolbypassrls)
        and pg_has_role(client_role, r.oid, 'MEMBER')
    ) then
      raise exception 'INF-03 unexpected privileged membership for %', client_role;
    end if;

    foreach table_name in array array['registrations','admin_profiles','clubs','classes',
      'schedules','banners','page_content'] loop
      if exists (
        select 1 from pg_class c where c.oid = format('public.%I', table_name)::regclass
          and pg_has_role(client_role, c.relowner, 'MEMBER')
      ) then
        raise exception 'INF-03 unexpected client ownership of %', table_name;
      end if;

      foreach operation in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        allowed := case
          when table_name in ('registrations','admin_profiles')
            then client_role = 'authenticated' and operation = 'SELECT'
          else operation = 'SELECT'
            or (client_role = 'authenticated' and operation in ('INSERT','UPDATE','DELETE'))
        end;

        if has_table_privilege(client_role, format('public.%I', table_name), operation) <> allowed
          or (case when not allowed and operation in ('SELECT','INSERT','UPDATE','REFERENCES')
            then has_any_column_privilege(client_role, format('public.%I', table_name), operation)
            else false end) then
          raise exception 'INF-03 unexpected effective % grant for % on %', operation, client_role, table_name;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;

-- Existing Edge Function uses the server-only service role. Fail atomically
-- if this deployment does not already have the two permissions it needs.
do $$
begin
  if not has_table_privilege('service_role', 'public.registrations', 'INSERT')
     or not has_column_privilege('service_role', 'public.clubs', 'name', 'SELECT')
     or not has_column_privilege('service_role', 'public.clubs', 'id', 'SELECT')
     or not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'Existing service-role intake privileges did not pass preflight';
  end if;
end
$$;

commit;
