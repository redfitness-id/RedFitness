-- Proposed only. Use the separate emergency approval checklist and review
-- alternate access paths before any execution.
begin;
set local lock_timeout = '5s';

do $$
begin
  if current_setting('rf.inf03_emergency_approval', true) is distinct from 'approved' then
    raise exception 'INF-03 emergency freeze requires explicit operator approval';
  end if;
end
$$;

revoke select, delete on public.registrations from public, anon, authenticated;
revoke insert, update, delete on public.clubs, public.classes, public.schedules,
  public.banners, public.page_content from public, anon, authenticated;

do $$
declare
  client_role text;
  relation text;
begin
  foreach client_role in array array['anon','authenticated'] loop
    if has_any_column_privilege(client_role, 'public.registrations', 'SELECT')
       or has_table_privilege(client_role, 'public.registrations', 'DELETE')
       or has_table_privilege(client_role, 'public.registrations', 'TRUNCATE') then
      raise exception 'Residual emergency lead privilege for %', client_role;
    end if;
    foreach relation in array array['public.clubs','public.classes','public.schedules',
        'public.banners','public.page_content'] loop
      if has_any_column_privilege(client_role, relation, 'INSERT')
        or has_any_column_privilege(client_role, relation, 'UPDATE')
        or has_table_privilege(client_role, relation, 'DELETE')
        or has_table_privilege(client_role, relation, 'TRUNCATE')
        or not has_table_privilege(client_role, relation, 'SELECT') then
        raise exception 'Emergency content privilege check failed for % on %', client_role, relation;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role','public.registrations','INSERT')
     or not has_column_privilege('service_role','public.clubs','id','SELECT')
     or not has_column_privilege('service_role','public.clubs','name','SELECT')
     or not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'Emergency freeze would interrupt current service-role intake';
  end if;
end
$$;

commit;
