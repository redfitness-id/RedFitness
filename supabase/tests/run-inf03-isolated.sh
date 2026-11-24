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

sql -c "alter table supabase_migrations.schema_migrations add constraint fixture_ledger_reject check (version <> '20261124000100')"
expect_failure 'ledger write rejection rolls back migration' 'fixture_ledger_reject' "$fingerprint"
sql -c 'alter table supabase_migrations.schema_migrations drop constraint fixture_ledger_reject'

run_migration "$fingerprint" >/dev/null
[[ "$(sql -Atc 'select version from supabase_migrations.schema_migrations')" = 20261124000100 ]]
printf 'PASS reviewed website migration and ledger entry\n'
if output=$(run_migration "$fingerprint" 2>&1) || [[ "$output" != *'ledger already contains'* ]]; then
  printf 'FAIL duplicate migration\n%s\n' "$output" >&2
  exit 1
fi
printf 'PASS rejects duplicate migration version\n'
run_storage >/dev/null
[[ "$(sql -Atc 'select version from supabase_migrations.schema_migrations where cardinality(statements) = 1 and name is not null order by version')" = $'20261124000100\n20261124000200' ]]
printf 'PASS reviewed Storage migration and ledger entry\n'
sql < supabase/tests/inf03_authorization.sql >/dev/null
printf 'PASS synthetic role and intake matrix\n'
