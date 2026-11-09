#!/usr/bin/env bash
# Applique sur le projet Supabase les migrations absentes de supabase_migrations.schema_migrations,
# chacune dans sa propre transaction. Équivalent minimal de `supabase db push`.
# Usage : SUPABASE_PROJECT_REF=xxxx SUPABASE_ACCESS_TOKEN=sbp_... scripts/db-push-remote.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF manquant}"
API="https://api.supabase.com/v1/projects/$REF/database/query"
AUTH=()
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
q() { python3 -c 'import json,sys;print(json.dumps({"query":sys.stdin.read()}))' | curl -sS -m 180 -X POST -H "Content-Type: application/json" "${AUTH[@]}" --data @- "$API"; }

applied=$(echo "select coalesce(json_agg(version), '[]') as v from supabase_migrations.schema_migrations" | q)
for f in supabase/migrations/*.sql; do
  base=$(basename "$f" .sql); version=${base%%_*}; name=${base#*_}
  if echo "$applied" | grep -q "\"$version\""; then echo "= $base (déjà appliquée)"; continue; fi
  echo "→ $base"
  out=$( { echo "begin;"; cat "$f"; echo; echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"; echo "commit;"; } | q)
  if echo "$out" | grep -q '"message"'; then echo "ÉCHEC : $out"; exit 1; fi
done
echo "Migrations à jour."
