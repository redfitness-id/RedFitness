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

for file in supabase/tests/inf03_fixture.sql \
  supabase/migrations/20261124000100_enforce_website_table_roles.sql \
  supabase/migrations/20261124000200_guard_fitness_asset_writes.sql \
  supabase/tests/inf03_authorization.sql; do
  docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres < "$file" >/dev/null
  printf 'PASS %s\n' "$file"
done
