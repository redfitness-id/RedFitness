-- Run after the synthetic fixture and both migrations, as the local test owner.
begin;

create function public.rf_test_rows(statement text, expected bigint) returns void
language plpgsql security invoker as $$
declare actual bigint;
begin
  execute statement;
  get diagnostics actual = row_count;
  if actual <> expected then
    raise exception 'Expected % affected rows, got %: %', expected, actual, statement;
  end if;
end
$$;

create function public.rf_test_denied(statement text) returns void
language plpgsql security invoker as $$
begin
  execute statement;
  raise exception 'Expected permission denial: %', statement;
exception when insufficient_privilege then
  return;
end
$$;

set local role anon;
select rf_test_denied('select * from registrations');
select rf_test_denied('delete from registrations');
select rf_test_denied('insert into registrations (first_name,email) values (''Fake'',''fake@example.invalid'')');
select rf_test_denied('select * from admin_profiles');
do $$
declare name text;
begin
  foreach name in array array['clubs','classes','schedules','banners','page_content'] loop
    perform rf_test_rows(format('select * from %I', name), 1);
    perform rf_test_denied(format('insert into %I (name) values (''denied'')', name));
    perform rf_test_denied(format('update %I set name = ''denied''', name));
    perform rf_test_denied(format('delete from %I', name));
  end loop;
end
$$;
select rf_test_rows('select * from storage.objects where bucket_id = ''fitness-assets''', 1);
select rf_test_denied('insert into storage.objects values (''fitness-assets'',''anon.webp'')');
select rf_test_rows('update storage.objects set name = ''blocked.webp'' where bucket_id = ''fitness-assets''', 0);
select rf_test_denied('update storage.objects set bucket_id = ''fitness-assets'' where name = ''other.webp''');
select rf_test_rows('insert into storage.objects values (''another-bucket'',''unrelated.webp'')', 1);
reset role;

set local role authenticated;
do $$
declare
  persona int;
  name text;
begin
  for persona in 1..4 loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000' || persona, true);
    perform rf_test_rows('select * from admin_profiles', case when persona = 1 then 0 else 1 end);
    perform rf_test_denied('insert into admin_profiles values (auth.uid(), ''admin'')');
    perform rf_test_denied('update admin_profiles set role = ''admin'' where id = auth.uid()');
    perform rf_test_denied('delete from admin_profiles');
    perform rf_test_rows('select * from registrations', case when persona = 4 then 1 else 0 end);
    perform rf_test_rows('delete from registrations where id = -1', 0);
    perform rf_test_denied('update registrations set phone = ''synthetic''');
    perform rf_test_denied('insert into registrations (first_name,email) values (''Fake'',''fake@example.invalid'')');

    foreach name in array array['clubs','classes','schedules','banners','page_content'] loop
      perform rf_test_rows(format('select * from %I', name), 1);
      if persona = 4 or (persona = 2 and name = 'schedules') then
        perform rf_test_rows(format('insert into %I (name) values (''editable fixture'')', name), 1);
        perform rf_test_rows(format('update %I set name = ''updated fixture'' where name = ''editable fixture''', name), 1);
        perform rf_test_rows(format('delete from %I where name = ''updated fixture''', name), 1);
      else
        perform rf_test_denied(format('insert into %I (name) values (''denied'')', name));
        perform rf_test_rows(format('update %I set name = ''denied''', name), 0);
        perform rf_test_rows(format('delete from %I', name), 0);
      end if;
    end loop;

    if persona = 4 then
      perform rf_test_rows('insert into page_content (id,name) values (1,''Updated CMS'')
        on conflict (id) do update set name = excluded.name', 1);
      perform rf_test_rows('insert into banners (id,name) values (1,''Updated banner'')
        on conflict (id) do update set name = excluded.name', 1);
      perform rf_test_rows('insert into storage.objects values (''fitness-assets'',''banners/admin.webp'')', 1);
      perform rf_test_rows('update storage.objects set name = ''banners/admin-updated.webp'' where name = ''banners/admin.webp''', 1);
      perform rf_test_rows('delete from storage.objects where name = ''banners/admin-updated.webp''', 0);
      perform rf_test_rows('delete from registrations', 1);
    else
      perform rf_test_rows('delete from registrations', 0);
      perform rf_test_denied('insert into storage.objects values (''fitness-assets'',''blocked.webp'')');
      perform rf_test_rows('update storage.objects set name = ''blocked.webp'' where bucket_id = ''fitness-assets''', 0);
      perform rf_test_denied('update storage.objects set bucket_id = ''fitness-assets'' where name = ''other.webp''');
    end if;
  end loop;
end
$$;
reset role;

set local role service_role;
select public.rf_test_rows('insert into public.registrations (first_name,email,club_id,source)
  values (''Synthetic function payload'',''sink@example.invalid'',''00000000-0000-0000-0000-000000000010'',''free_trial'')', 1);
select public.rf_test_rows('select name from public.clubs where id = ''00000000-0000-0000-0000-000000000010''', 1);
reset role;

rollback;
