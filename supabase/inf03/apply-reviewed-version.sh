#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

version=${1:-}
case "$version" in
  20261124000100) name=enforce_website_table_roles ;;
  20261124000200) name=guard_fitness_asset_writes ;;
  *) printf 'Specify exactly one INF-03 migration version.\n' >&2; exit 2 ;;
esac
if [[ $# != 1 || "${INF03_APPROVED_VERSION:-}" != "$version" ]]; then
  printf 'Explicit approval for this exact version is required.\n' >&2
  exit 2
fi
if [[ "$version" == 20261124000100 && ! "${INF03_REVIEWED_INVENTORY_MD5:-}" =~ ^[0-9a-f]{32}$ ]]; then
  printf 'An independently reviewed inventory fingerprint is required.\n' >&2
  exit 2
fi

migration="supabase/migrations/${version}_${name}.sql"
encoded_sql=$(base64 < "$migration" | tr -d '\n')

# Use the operator-provided libpq connection settings. Never derives approval
# from the target. One psql session and transaction owns DDL and ledger write.
{
  printf "set local lock_timeout = '5s';\n"
  printf "lock table supabase_migrations.schema_migrations in share row exclusive mode;\n"
  printf "select set_config('rf.inf03_release_version', '%s', true) is not null;\n" "$version"
  cat <<'SQL'
do $$
declare
  release_version text := current_setting('rf.inf03_release_version');
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version >= release_version) then
    raise exception 'INF-03 ledger already contains this version or a later version';
  end if;
  if release_version = '20261124000200' and not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261124000100'
  ) then
    raise exception 'INF-03 migration 001 must be recorded before 002';
  end if;
end
$$;
SQL
  if [[ "$version" == 20261124000100 ]]; then
    cat supabase/inf03/inventory.sql
    printf "set local rf.inf03_reviewed_inventory_md5 = '%s';\n" "$INF03_REVIEWED_INVENTORY_MD5"
  fi
  cat "$migration"
  printf "insert into supabase_migrations.schema_migrations (version, name, statements) values ('%s', '%s', array[convert_from(decode('%s', 'base64'), 'UTF8')]);\n" "$version" "$name" "$encoded_sql"
} | psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f -
