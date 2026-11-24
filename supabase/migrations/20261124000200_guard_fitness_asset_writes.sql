-- Apply through supabase/inf03/apply-reviewed-version.sh.
do $$
begin
  if current_setting('rf.inf03_release_version', true) is distinct from '20261124000200' then
    raise exception 'INF-03 requires the exact-version release runner';
  end if;
end
$$;

-- Execute only after verifying the actual Storage grants and existing policies.
-- Restrictive policies narrow existing permissions, including policies added
-- outside this repository. They grant no new operations or bucket access.
do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'storage.objects'::regclass and relrowsecurity
  ) or not exists (
    select 1 from storage.buckets where id = 'fitness-assets'
  ) then
    raise exception 'Storage preflight failed: expected protected fitness-assets bucket';
  end if;
end
$$;

-- Separate anonymous and authenticated guards so anonymous policies never need
-- permission to evaluate the protected staff-role helper.
create policy rf_fitness_assets_anon_insert on storage.objects
  as restrictive for insert to anon
  with check (bucket_id is distinct from 'fitness-assets');
create policy rf_fitness_assets_anon_update on storage.objects
  as restrictive for update to anon
  using (bucket_id is distinct from 'fitness-assets')
  with check (bucket_id is distinct from 'fitness-assets');
create policy rf_fitness_assets_anon_delete on storage.objects
  as restrictive for delete to anon
  using (bucket_id is distinct from 'fitness-assets');

create policy rf_fitness_assets_staff_insert on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id is distinct from 'fitness-assets'
    or (select rf_security.has_staff_role(array['admin'])));
create policy rf_fitness_assets_staff_update on storage.objects
  as restrictive for update to authenticated
  using (bucket_id is distinct from 'fitness-assets'
    or (select rf_security.has_staff_role(array['admin'])))
  with check (bucket_id is distinct from 'fitness-assets'
    or (select rf_security.has_staff_role(array['admin'])));
create policy rf_fitness_assets_staff_delete on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id is distinct from 'fitness-assets'
    or (select rf_security.has_staff_role(array['admin'])));
