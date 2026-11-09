"""Prépare le fichier de tests SQL pour l'API de gestion Supabase.

L'API exécute tout le texte dans une seule transaction implicite : on retire les
méta-commandes psql et on valide (COMMIT) les écritures avant la section « curseur
de pull », car un pull ne doit pas voir comme « nouvelles » des écritures déjà
validées — ce qui n'est vrai qu'entre transactions distinctes, comme en production.
"""
import json
import sys

lines = [l for l in open(sys.argv[1], encoding="utf-8").read().splitlines() if not l.startswith("\\")]
sql = "\n".join(lines)
marker = sql.index("-- 5. Curseur de pull")
cut = sql.rfind("\n-- ----", 0, marker)
sql = (
    sql[:cut]
    + "\nreset role;\ncommit;\nselect tests.login('00000000-0000-0000-0000-00000000000a');\n"
    + sql[cut:]
    + "\nreset role;\ndo $$ begin raise exception 'RESULTAT_TESTS: % assertions OK', "
      "(select count(*) from tests.results); end $$;\n"
)
print(json.dumps({"query": sql}))
