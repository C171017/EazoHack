#!/usr/bin/env bash
set -euo pipefail

# Creates its own disposable cluster. Never accepts a production connection string.
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${EAZO_TEST_PG_BIN:-}"
if [[ -z "$pg_bin" ]]; then
  if command -v initdb >/dev/null 2>&1; then
    pg_bin="$(dirname "$(command -v initdb)")"
  elif [[ -x /opt/homebrew/opt/postgresql@14/bin/initdb ]]; then
    pg_bin=/opt/homebrew/opt/postgresql@14/bin
  else
    echo 'Set EAZO_TEST_PG_BIN to the directory containing initdb, pg_ctl and psql.' >&2
    exit 1
  fi
fi
test_dir="$(mktemp -d /tmp/eazo-account-db.XXXXXX)"
cleanup() {
  if [[ -f "$test_dir/data/postmaster.pid" ]]; then
    "$pg_bin/pg_ctl" -D "$test_dir/data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
"$pg_bin/initdb" -D "$test_dir/data" -A trust --encoding=UTF8 --no-locale >"$test_dir/init.log" 2>&1 || { cat "$test_dir/init.log"; exit 1; }
"$pg_bin/pg_ctl" -D "$test_dir/data" -l "$test_dir/server.log" -o "-k $test_dir -h ''" -w start >"$test_dir/start.log" 2>&1 || { cat "$test_dir/start.log"; exit 1; }
psql_args=(-h "$test_dir" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q)
run_sql() {
  "$pg_bin/psql" "${psql_args[@]}" -f "$1" >"$test_dir/result.log" 2>&1 || { cat "$test_dir/result.log"; exit 1; }
}
run_sql "$repo_dir/supabase/tests/local-platform.sql"
for migration in "$repo_dir"/supabase/migrations/*.sql; do run_sql "$migration"; done
for check in access-controls worker-integration account-sync book-deletion; do
  run_sql "$repo_dir/supabase/tests/$check.sql"
  echo "PASS: $check"
done
EAZO_TEST_PG_SOCKET="$test_dir" EAZO_TEST_PSQL="$pg_bin/psql" node "$repo_dir/scripts/test-account-concurrency.mjs"
echo 'All disposable database tests passed. The temporary cluster will now be removed.'
