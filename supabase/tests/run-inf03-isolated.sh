#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# No mapped ports, remote database URL, credentials, or production data.
container=$(docker run --rm --detach --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15)
trap 'docker stop "$container" >/dev/null' EXIT
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done

sql() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
inventory=supabase/inf03/inventory.sql
migration=supabase/migrations/20261124000100_enforce_website_table_roles.sql
sql < supabase/tests/inf03_fixture.sql
fingerprint=$( { cat "$inventory"; printf 'select md5(pg_temp.inf03_inventory()::text);\n'; } | sql -At)
[[ "$fingerprint" =~ ^[0-9a-f]{32}$ ]]

run_migration() {
  { cat "$inventory"; printf "set rf.inf03_reviewed_inventory_md5 = '%s';\n" "$1"; cat "$migration"; } | sql
}

expect_failure() {
  local label=$1 expected=$2 approved=$3 output
  if output=$(run_migration "$approved" 2>&1) || [[ "$output" != *"$expected"* ]]; then
    printf 'FAIL %s\n%s\n' "$label" "$output" >&2
    exit 1
  fi
  [[ "$(sql -Atc "select count(*) from pg_policies where policyname = 'broad_public_write'")" = 5 ]]
  [[ "$(sql -Atc "select to_regnamespace('rf_security') is null")" = t ]]
  printf 'PASS %s (no policy replacement)\n' "$label"
}

expect_failure 'missing approval' 'requires an independently reviewed inventory' ''
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

run_migration "$fingerprint"
printf 'PASS reviewed website migration\n'
for file in supabase/migrations/20261124000200_guard_fitness_asset_writes.sql supabase/tests/inf03_authorization.sql; do
  sql < "$file" >/dev/null
  printf 'PASS %s\n' "$file"
done
