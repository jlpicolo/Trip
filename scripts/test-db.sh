#!/usr/bin/env bash
# Applique la migration sur une base PostgreSQL jetable puis exécute les tests
# SQL (RLS, Storage, synchronisation, validations).
# Variables : PGHOST, PGPORT, PGUSER (superutilisateur), DB (défaut jt_test).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DB:-jt_test}"
dropdb --if-exists "$DB" >/dev/null
createdb "$DB"
psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
for f in supabase/tests/*.test.sql; do
  echo "▶ $f"
  psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
dropdb "$DB"
