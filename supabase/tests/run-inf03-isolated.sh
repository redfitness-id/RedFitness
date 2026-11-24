#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# No mapped ports, remote database URL, credentials, or production data.
container=$(docker run --rm --detach --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15)
shim=$(mktemp -d)
trap 'docker stop "$container" >/dev/null; rm -r "$shim"' EXIT
export INF03_TEST_CONTAINER="$container"
cat > "$shim/psql" <<'SH'
#!/usr/bin/env bash
exec docker exec -i "$INF03_TEST_CONTAINER" psql -U postgres "$@"
SH
chmod +x "$shim/psql"
export PATH="$shim:$PATH"
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done

sql() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
inventory=supabase/inf03/inventory.sql
runner=supabase/inf03/apply-reviewed-version.sh
sql < supabase/tests/inf03_fixture.sql
# Exercise the separate emergency candidate on a clone of the synthetic baseline.
sql -c 'create database inf03_emergency template postgres'
{
  printf "set rf.inf03_emergency_approval = 'approved';\n"
  cat supabase/inf03/emergency-freeze.sql
} | sql -d inf03_emergency
sql -d inf03_emergency <<'SQL'
set role anon;
select id from public.clubs;
insert into public.registrations (first_name,email) values ('Emergency fixture','emergency@example.invalid');
reset role;
set role service_role;
insert into public.registrations (first_name,email) values ('Intake fixture','intake@example.invalid');
select name from public.clubs;
SQL
printf 'PASS separate emergency candidate on synthetic baseline\n'
fingerprint=$( { cat "$inventory"; printf 'select md5(pg_temp.inf03_inventory()::text);\n'; } | sql -At)
[[ "$fingerprint" =~ ^[0-9a-f]{32}$ ]]

run_migration() {
  INF03_APPROVED_VERSION=20261124000100 INF03_REVIEWED_INVENTORY_MD5="$1" "$runner" 20261124000100
}
run_storage() {
  INF03_APPROVED_VERSION=20261124000200 "$runner" 20261124000200
}

expect_failure() {
  local label=$1 expected=$2 approved=$3 output
  if output=$(run_migration "$approved" 2>&1) || [[ "$output" != *"$expected"* ]]; then
    printf 'FAIL %s\n%s\n' "$label" "$output" >&2
    exit 1
  fi
  [[ "$(sql -Atc "select count(*) from pg_policies where policyname = 'broad_public_write'")" = 5 ]]
  [[ "$(sql -Atc "select to_regnamespace('rf_security') is null")" = t ]]
  [[ "$(sql -Atc 'select count(*) from supabase_migrations.schema_migrations')" = 0 ]]
  printf 'PASS %s (no policy replacement)\n' "$label"
}

if output=$(INF03_APPROVED_VERSION=20261124000200 INF03_REVIEWED_INVENTORY_MD5="$fingerprint"   "$runner" 20261124000100 2>&1) || [[ "$output" != *'approval for this exact version is required'* ]]; then
  printf 'FAIL mismatched approval\n%s\n' "$output" >&2
  exit 1
fi
printf 'PASS rejects approval for a different migration version\n'
expect_failure 'missing fingerprint' 'independently reviewed inventory fingerprint is required' ''
if output=$(run_storage 2>&1) || [[ "$output" != *'migration 001 must be recorded before 002'* ]]; then
  printf 'FAIL out-of-order migration\n%s\n' "$output" >&2
  exit 1
fi
[[ "$(sql -Atc 'select count(*) from supabase_migrations.schema_migrations')" = 0 ]]
printf 'PASS rejects migration 002 before 001\n'
sql -c 'create policy extra on public.clubs for select using (true)'
expect_failure 'unexpected policy' 'inventory drift' "$fingerprint"
sql -c 'drop policy extra on public.clubs'
sql -c 'alter table public.clubs add column extra text'
expect_failure 'schema drift' 'inventory drift' "$fingerprint"
sql -c 'alter table public.clubs drop column extra'
sql -c 'create view public.fixture_view as select id from public.registrations'
expect_failure 'unexpected view dependency' 'inventory drift' "$fingerprint"
sql -c 'drop view public.fixture_view'
sql -c "create function public.fixture_rpc() returns bigint language sql as 'select count(*) from public.registrations'"
expect_failure 'unexpected RPC' 'inventory drift' "$fingerprint"
sql -c 'drop function public.fixture_rpc()'
sql -c 'grant update (email) on public.registrations to anon'
expect_failure 'unexpected column grant' 'inventory drift' "$fingerprint"
sql -c 'revoke update (email) on public.registrations from anon'
sql -c 'create role fixture_parent; grant fixture_parent to authenticated; grant delete on public.registrations to fixture_parent'
expect_failure 'unreviewed inherited grant' 'inventory drift' "$fingerprint"
drift_fingerprint=$( { cat "$inventory"; printf 'select md5(pg_temp.inf03_inventory()::text);\n'; } | sql -At)
expect_failure 'reviewed inventory still rejects residual inherited DELETE' 'unexpected effective DELETE grant' "$drift_fingerprint"
sql -c 'revoke delete on public.registrations from fixture_parent; grant update (email) on public.registrations to fixture_parent'
drift_fingerprint=$( { cat "$inventory"; printf 'select md5(pg_temp.inf03_inventory()::text);\n'; } | sql -At)
expect_failure 'reviewed inventory still rejects residual inherited column UPDATE' 'unexpected effective UPDATE grant' "$drift_fingerprint"
sql -c 'revoke update (email) on public.registrations from fixture_parent; revoke fixture_parent from authenticated; drop role fixture_parent'
sql -c 'revoke insert on public.registrations from service_role'
drift_fingerprint=$( { cat "$inventory"; printf 'select md5(pg_temp.inf03_inventory()::text);\n'; } | sql -At)
expect_failure 'missing service-role intake permission' 'Existing service-role intake privileges' "$drift_fingerprint"
sql -c 'grant insert on public.registrations to service_role'
# Re-applying the same grant may change catalog ACL ordering. Recompute only
# for this disposable test fixture and never for a production release.
fingerprint=$( { cat "$inventory"; printf 'select md5(pg_temp.inf03_inventory()::text);\n'; } | sql -At)

# Assert the DDL is visible inside the ledger insert, then reject that insert.
sql <<'SQL'
create function supabase_migrations.fixture_reject_ledger() returns trigger
language plpgsql as $$
begin
  if new.version = '20261124000100' then
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = 'registrations' and policyname = 'rf_registrations_admin_read')
      or has_table_privilege('authenticated', 'public.registrations', 'DELETE') then
      raise exception 'fixture expected website policy and grant DDL before ledger insert';
    end if;
  elsif new.version = '20261124000200' then
    if (select count(*) from pg_policies where schemaname = 'storage'
        and tablename = 'objects' and policyname like 'rf_fitness_assets_%'
        and permissive = 'RESTRICTIVE') <> 6 then
      raise exception 'fixture expected all Storage guards before ledger insert';
    end if;
  end if;
  raise exception 'fixture rejected ledger insert after DDL for %', new.version;
end
$$;
create trigger fixture_reject_ledger before insert on supabase_migrations.schema_migrations
  for each row execute function supabase_migrations.fixture_reject_ledger();
SQL

snapshot() {
  {
    cat "$inventory"
    cat <<'SQL'
select pg_temp.inf03_inventory();
select coalesce(jsonb_agg(to_jsonb(p) order by policyname), '[]')
  from pg_policies p where schemaname = 'storage' and tablename = 'objects';
select relacl::text from pg_class where oid = 'storage.objects'::regclass;
select attname, attacl::text from pg_attribute where attrelid = 'storage.objects'::regclass
  and attnum > 0 and not attisdropped order by attnum;
select role_name, privilege,
  has_table_privilege(role_name, 'storage.objects', privilege)
from unnest(array['anon', 'authenticated', 'service_role']) role_name
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege
order by role_name, privilege;
select coalesce(jsonb_agg(to_jsonb(m) order by version), '[]')
  from supabase_migrations.schema_migrations m;
SQL
  } | sql -At
}

expect_ledger_rollback() {
  local version=$1 runner_function=$2 before after output
  before=$(snapshot)
  if output=$("$runner_function" "$fingerprint" 2>&1) ||
    [[ "$output" != *"fixture rejected ledger insert after DDL for $version"* ]]; then
    printf 'FAIL ledger rejection for %s\n%s\n' "$version" "$output" >&2
    exit 1
  fi
  after=$(snapshot)
  if [[ "$before" != "$after" ]]; then
    printf 'FAIL snapshot changed after rejected ledger insert for %s\n' "$version" >&2
    exit 1
  fi
  printf 'PASS %s DDL visible before rejected ledger insert; original policies, grants and ledger preserved\n' "$version"
}

# Compute approval only for this disposable fixture, including the test trigger.
fingerprint=$( { cat "$inventory"; printf 'select md5(pg_temp.inf03_inventory()::text);\n'; } | sql -At)
expect_ledger_rollback 20261124000100 run_migration
sql -c 'alter table supabase_migrations.schema_migrations disable trigger fixture_reject_ledger'

run_migration "$fingerprint" >/dev/null
[[ "$(sql -Atc 'select version from supabase_migrations.schema_migrations')" = 20261124000100 ]]
printf 'PASS reviewed website migration and ledger entry\n'
if output=$(run_migration "$fingerprint" 2>&1) || [[ "$output" != *'ledger already contains'* ]]; then
  printf 'FAIL duplicate migration\n%s\n' "$output" >&2
  exit 1
fi
printf 'PASS rejects duplicate migration version\n'
sql -c 'alter table supabase_migrations.schema_migrations enable trigger fixture_reject_ledger'
expect_ledger_rollback 20261124000200 run_storage
sql -c 'alter table supabase_migrations.schema_migrations disable trigger fixture_reject_ledger'
run_storage >/dev/null
[[ "$(sql -Atc 'select version from supabase_migrations.schema_migrations where cardinality(statements) = 1 and name is not null order by version')" = $'20261124000100\n20261124000200' ]]
printf 'PASS reviewed Storage migration and ledger entry\n'
if output=$(run_storage 2>&1) || [[ "$output" != *'ledger already contains'* ]]; then
  printf 'FAIL duplicate Storage migration\n%s\n' "$output" >&2
  exit 1
fi
printf 'PASS rejects duplicate Storage migration version\n'
sql < supabase/tests/inf03_authorization.sql >/dev/null
printf 'PASS synthetic role and intake matrix\n'
