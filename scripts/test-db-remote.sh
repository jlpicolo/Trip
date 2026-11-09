#!/usr/bin/env bash
# Exécute les tests SQL sur un projet Supabase réel via l'API de gestion, puis
# supprime systématiquement les données de test.
# Usage : SUPABASE_PROJECT_REF=xxxx SUPABASE_ACCESS_TOKEN=sbp_... scripts/test-db-remote.sh
# (dans l'environnement cloud de Claude, le jeton est injecté par le proxy).
set -uo pipefail
cd "$(dirname "$0")/.."
REF="${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF manquant}"
API="https://api.supabase.com/v1/projects/$REF/database/query"
AUTH=()
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")

run() { curl -sS -m 180 -X POST -H "Content-Type: application/json" "${AUTH[@]}" --data @- "$API"; }

OUT=$(python3 scripts/lib/remote_test_payload.py supabase/tests/10_rls_and_sync.test.sql | run)
python3 -c 'import json,sys;print(json.dumps({"query":open(sys.argv[1]).read()}))' supabase/tests/remote_cleanup.sql | run >/dev/null
echo "$OUT"
# Le script se termine volontairement par une exception portant le résultat (annule la fin du test).
echo "$OUT" | grep -q "RESULTAT_TESTS" && ! echo "$OUT" | grep -q "ÉCHEC"
