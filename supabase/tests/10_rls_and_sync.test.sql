-- Tests d'intégration base de données : comptes, groupe partagé, égalité des
-- droits, isolation entre groupes, Storage, synchronisation idempotente,
-- conflits, validation des dépenses, séparation des dépenses individuelles.
-- Exécution : scripts/test-db.sh  (chaque assertion lève une exception si KO)
\set ON_ERROR_STOP 1
\pset pager off
\pset tuples_only on
\o /dev/null

create schema tests;
create table tests.results (name text, ok boolean);
grant usage on schema tests to authenticated, anon;
grant all on tests.results to authenticated, anon;

create function tests.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'ÉCHEC : %', p_name;
  end if;
  insert into tests.results values (p_name, true);
end $$;

create function tests.throws(p_sql text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    insert into tests.results values (p_name, true);
    return;
  end;
  raise exception 'ÉCHEC (aucune erreur levée) : %', p_name;
end $$;

create function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    (select jsonb_build_object('sub', id, 'email', email, 'role', 'authenticated')::text
     from auth.users where id = p_uid), false);
  execute 'set role authenticated';
end $$;

grant execute on all functions in schema tests to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Création de 4 comptes + 1 externe → profils créés automatiquement
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@example.com', '{"display_name":"Bruno"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chloe@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'thomas@example.com', '{"display_name":"Thomas"}'),
  ('00000000-0000-0000-0000-0000000000ee', 'mallory@example.com', '{"display_name":"Mallory"}');

select tests.ok((select count(*) = 5 from public.profiles), 'profils créés par trigger');
select tests.ok((select display_name = 'chloe' from public.profiles
                 where id = '00000000-0000-0000-0000-00000000000c'), 'display_name par défaut = partie locale email');

-- ---------------------------------------------------------------------------
-- 2. Alice crée le groupe, invite les 3 autres ; Mallory a son propre groupe
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');
create temp table ctx as select public.create_group('Japon 2027') as group_id;
grant select on ctx to authenticated;
create temp table tokens (email text, token text);
grant all on tokens to authenticated;
insert into tokens select e, public.create_invitation((select group_id from ctx), e)
  from unnest(array['bruno@example.com', 'CHLOE@example.com ', 'thomas@example.com']) e;
select tests.ok((select count(*) = 3 from tokens where length(token) = 64), 'jetons d''invitation générés');
select tests.ok((select count(*) = 3 from public.group_invitations where token_hash ~ '^[0-9a-f]{64}$'
                 and email in ('bruno@example.com', 'chloe@example.com', 'thomas@example.com')),
                'seul le hash du jeton est stocké, email normalisé');

-- Mallory ne peut pas utiliser le jeton de Bruno (email différent)
select tests.login('00000000-0000-0000-0000-0000000000ee');
select tests.throws(format('select public.accept_invitation(%L)',
  (select token from tokens where email = 'bruno@example.com')), 'jeton refusé pour un autre email');
select tests.throws(format('select public.create_invitation(%L, %L)', (select group_id from ctx), 'x@example.com'),
  'un non-membre ne peut pas inviter');
create temp table ctx_m as select public.create_group('Groupe de Mallory') as group_id;

select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.ok(public.accept_invitation((select token from tokens where email = 'bruno@example.com'))
                = (select group_id from ctx), 'Bruno rejoint le groupe');
select tests.ok(public.accept_invitation((select token from tokens where email = 'bruno@example.com'))
                = (select group_id from ctx), 'acceptation idempotente');
select tests.login('00000000-0000-0000-0000-00000000000c');
select public.accept_invitation((select token from tokens where email = 'CHLOE@example.com '));
-- Bruno (non-créateur) invite Thomas → égalité des droits : déjà invité par Alice, on réutilise.
select tests.login('00000000-0000-0000-0000-00000000000d');
select public.accept_invitation((select token from tokens where email = 'thomas@example.com'));
select tests.ok((select count(*) = 4 from public.group_members where group_id = (select group_id from ctx)),
                '4 membres visibles depuis Thomas');

-- ---------------------------------------------------------------------------
-- 3. Voyage créé par Bruno (pas par le créateur du groupe) → égalité
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000001', 'table', 'trips', 'op', 'insert',
  'id', '20000000-0000-0000-0000-000000000001',
  'data', jsonb_build_object('group_id', (select group_id from ctx), 'name', 'Japan Trip',
          'start_date', '2027-03-09', 'end_date', '2027-03-30', 'timezone', 'Asia/Tokyo',
          'base_currency', 'EUR', 'secondary_currency', 'JPY',
          'version', 99, 'created_by', '00000000-0000-0000-0000-0000000000ee'))))->0->>'status') = 'ok',
  'Bruno crée le voyage via sync_push');
select tests.ok((select version = 1 and created_by = '00000000-0000-0000-0000-00000000000b'
                 from public.trips), 'version et auteur imposés par le serveur (non falsifiables)');

-- Mallory ne voit rien et ne peut rien écrire dans ce voyage
select tests.login('00000000-0000-0000-0000-0000000000ee');
select tests.ok((select count(*) = 0 from public.trips), 'isolation : Mallory ne voit pas le voyage');
select tests.ok((select count(*) = 0 from public.profiles where id <> '00000000-0000-0000-0000-0000000000ee'),
                'isolation : Mallory ne voit pas les profils des autres');
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-0000000000e1', 'table', 'places', 'op', 'insert',
  'id', '30000000-0000-0000-0000-0000000000e1',
  'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'name', 'Intrus'))))->0->>'status') = 'error',
  'isolation : Mallory ne peut pas insérer');
select tests.throws($$select public.sync_pull('20000000-0000-0000-0000-000000000001')$$,
  'isolation : Mallory ne peut pas faire de pull');
select tests.throws($$insert into public.trips (id, group_id, name, start_date, end_date)
  values (gen_random_uuid(), (select group_id from ctx), 'x', '2027-01-01', '2027-01-02')$$,
  'isolation : Mallory ne peut pas créer de voyage dans le groupe');
select tests.ok((select count(*) = 0 from public.activity_log), 'isolation : journal invisible');

-- ---------------------------------------------------------------------------
-- 4. Lieu + activité associée, modifiés par des voyageurs différents
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000d');
create temp table r1 as select public.sync_push(jsonb_build_array(
  jsonb_build_object('mutation_id', '10000000-0000-0000-0000-000000000002', 'table', 'places', 'op', 'insert',
    'id', '30000000-0000-0000-0000-000000000001',
    'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'name', 'Fushimi Inari',
            'category', 'monument', 'city', 'Kyoto', 'lat', 34.9671, 'lng', 135.7727)),
  jsonb_build_object('mutation_id', '10000000-0000-0000-0000-000000000003', 'table', 'activities', 'op', 'insert',
    'id', '40000000-0000-0000-0000-000000000001',
    'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'title', 'Fushimi Inari tôt le matin',
            'category', 'visit', 'date', '2027-03-14', 'place_id', '30000000-0000-0000-0000-000000000001'))
)) as res;
select tests.ok((select bool_and(e->>'status' = 'ok') from r1, jsonb_array_elements(res) e), 'Thomas crée lieu + activité');

-- Rejouer exactement le même lot (ack perdu) → aucun doublon, mêmes résultats
select tests.ok((select bool_and(e->>'status' = 'ok') from jsonb_array_elements(public.sync_push(
  (select jsonb_agg(jsonb_build_object('mutation_id', e->>'mutation_id', 'table', 'places', 'op', 'insert',
     'id', e->'row'->>'id', 'data', '{}'::jsonb)) from r1, jsonb_array_elements(res) e))) e),
  'rejeu idempotent : résultat mémorisé renvoyé');
select tests.ok((select count(*) = 1 from public.places), 'rejeu : pas de doublon');

-- Chloé modifie l'activité (version 1 → 2)
select tests.login('00000000-0000-0000-0000-00000000000c');
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000004', 'table', 'activities', 'op', 'update',
  'id', '40000000-0000-0000-0000-000000000001', 'base_version', 1,
  'data', jsonb_build_object('start_time', '07:00', 'trip_id', '20000000-0000-0000-0000-0000000000ee'))))->0->'row'->>'version') = '2',
  'Chloé modifie l''activité de Thomas (égalité des droits)');
select tests.ok((select updated_by = '00000000-0000-0000-0000-00000000000c' and created_by = '00000000-0000-0000-0000-00000000000d'
                   and trip_id = '20000000-0000-0000-0000-000000000001'
                 from public.activities), 'auteur de modification tracé, trip_id ignoré en update');

-- Alice, hors ligne, avait modifié la version 1 → conflit explicite, rien n'est écrasé
select tests.login('00000000-0000-0000-0000-00000000000a');
create temp table r2 as select public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000005', 'table', 'activities', 'op', 'update',
  'id', '40000000-0000-0000-0000-000000000001', 'base_version', 1,
  'data', jsonb_build_object('start_time', '09:30')))) as res;
select tests.ok((select res->0->>'status' = 'conflict' and res->0->'row'->>'version' = '2'
                 and res->0->'row'->>'start_time' = '07:00:00' from r2),
  'modification concurrente → conflit avec ligne serveur renvoyée');
select tests.ok((select start_time = '07:00' from public.activities), 'conflit : aucune écriture silencieuse');
select tests.ok((select count(*) = 0 from public.applied_mutations
                 where mutation_id = '10000000-0000-0000-0000-000000000005'), 'conflit non mémorisé (renvoyable après résolution)');

-- Écriture directe (hors RPC) avec une version périmée → aussi refusée
select tests.throws($$update public.activities set title = 'x', version = 1$$, 'écriture directe périmée refusée');
select tests.throws($$update public.activities set trip_id = '20000000-0000-0000-0000-0000000000ee', version = 2$$,
  'trip_id immuable');
delete from public.activities;
select tests.ok((select count(*) = 1 from public.activities), 'suppression physique sans effet');

-- Suppression logique → tombstone propagée
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000006', 'table', 'activities', 'op', 'delete',
  'id', '40000000-0000-0000-0000-000000000001', 'base_version', 2)))->0->'row'->>'deleted_at') is not null,
  'suppression logique');

-- ---------------------------------------------------------------------------
-- 5. Curseur de pull : seules les nouveautés sont renvoyées
-- ---------------------------------------------------------------------------
create temp table p1 as select public.sync_pull('20000000-0000-0000-0000-000000000001') as res;
select tests.ok((select jsonb_array_length(res->'tables'->'activities') = 1
                 and jsonb_array_length(res->'tables'->'places') = 1 from p1), 'pull complet initial (tombstones incluses)');
select tests.ok((select jsonb_array_length(res->'tables'->'activity_log') >= 5 from p1), 'journal d''activité renvoyé');
select tests.ok((select bool_and(jsonb_array_length(v) = 0) from p1,
                 jsonb_each(public.sync_pull('20000000-0000-0000-0000-000000000001', p1.res->>'cursor')->'tables') t(k, v)
                 where k <> 'activity_log'),
  'pull incrémental vide sans changement');

-- ---------------------------------------------------------------------------
-- 6. Journées : id déterministe, création concurrente fusionnée
-- ---------------------------------------------------------------------------
select public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000007', 'table', 'trip_days', 'op', 'insert',
  'id', '50000000-0000-0000-0000-000000000014',
  'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'date', '2027-03-14', 'city', 'Kyoto'))));
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000008', 'table', 'trip_days', 'op', 'insert',
  'id', '50000000-0000-0000-0000-000000000014',
  'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'date', '2027-03-14', 'is_free', true))))->0->>'status') = 'conflict',
  'double création hors ligne d''une journée → conflit à fusionner, pas de doublon');

-- ---------------------------------------------------------------------------
-- 7. Dépenses communes : validations serveur
-- ---------------------------------------------------------------------------
reset role;
create function tests.expense(p_mid text, p_id text, p_total int, p_shares jsonb, p_payer text default '00000000-0000-0000-0000-00000000000b')
returns jsonb language sql as $$
  select public.sync_push(jsonb_build_array(jsonb_build_object(
    'mutation_id', p_mid, 'table', 'expenses', 'op', 'insert', 'id', p_id,
    'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'title', 'Ramen',
            'category', 'food', 'date', '2027-03-10', 'amount_minor', p_total, 'currency', 'EUR', 'fx_rate', 1,
            'base_amount_minor', p_total, 'paid_by', p_payer, 'split_mode', 'equal', 'shares', p_shares))))->0;
$$;
grant execute on function tests.expense to authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');

select tests.ok(tests.expense('10000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000001', 1000,
  '[{"user_id":"00000000-0000-0000-0000-00000000000a","weight":1,"base_minor":334},
    {"user_id":"00000000-0000-0000-0000-00000000000b","weight":1,"base_minor":333},
    {"user_id":"00000000-0000-0000-0000-00000000000c","weight":1,"base_minor":333}]')->>'status' = 'ok',
  'dépense valide (10,00 € / 3)');
select tests.ok(tests.expense('10000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000002', 1000,
  '[{"user_id":"00000000-0000-0000-0000-00000000000a","weight":1,"base_minor":333},
    {"user_id":"00000000-0000-0000-0000-00000000000b","weight":1,"base_minor":333}]')->>'error' = 'shares_sum_mismatch',
  'somme des parts ≠ total refusée');
select tests.ok(tests.expense('10000000-0000-0000-0000-000000000012', '60000000-0000-0000-0000-000000000003', 1000,
  '[{"user_id":"00000000-0000-0000-0000-0000000000ee","weight":1,"base_minor":1000}]')->>'error' = 'share_user_not_member',
  'part attribuée à un non-membre refusée');
select tests.ok(tests.expense('10000000-0000-0000-0000-000000000013', '60000000-0000-0000-0000-000000000004', 1000,
  '[{"user_id":"00000000-0000-0000-0000-00000000000a","weight":1,"base_minor":1000}]',
  '00000000-0000-0000-0000-0000000000ee')->>'error' = 'payer_not_member',
  'payeur non-membre refusé');
select tests.ok(tests.expense('10000000-0000-0000-0000-000000000014', '60000000-0000-0000-0000-000000000005', 1000,
  '[{"user_id":"00000000-0000-0000-0000-00000000000a","weight":1,"base_minor":500},
    {"user_id":"00000000-0000-0000-0000-00000000000a","weight":1,"base_minor":500}]')->>'error' = 'share_user_duplicate',
  'voyageur en double dans la répartition refusé');
select tests.ok(tests.expense('10000000-0000-0000-0000-000000000015', '60000000-0000-0000-0000-000000000006', 1000,
  '[{"user_id":"00000000-0000-0000-0000-00000000000a","weight":1,"base_minor":999.5},
    {"user_id":"00000000-0000-0000-0000-00000000000b","weight":1,"base_minor":0.5}]')->>'error' = 'share_amount_invalid',
  'montant fractionnaire d''unité mineure refusé');
-- rejeu de la dépense valide → toujours une seule dépense
select tests.expense('10000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000001', 1000, '[]');
select tests.ok((select count(*) = 1 from public.expenses), 'dépense rejouée : pas de doublon');

-- ---------------------------------------------------------------------------
-- 8. Dépenses individuelles : lecture partagée, écriture par le propriétaire
-- ---------------------------------------------------------------------------
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000020', 'table', 'personal_expenses', 'op', 'insert',
  'id', '70000000-0000-0000-0000-000000000001',
  'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'owner_id', '00000000-0000-0000-0000-00000000000b',
          'title', 'Souvenir', 'category', 'souvenir', 'date', '2027-03-11', 'amount_minor', 3000, 'currency', 'JPY',
          'fx_rate', 0.0061, 'base_amount_minor', 1830))))->0->>'status') = 'ok', 'Bruno ajoute une dépense perso');
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000021', 'table', 'personal_expenses', 'op', 'insert',
  'id', '70000000-0000-0000-0000-000000000002',
  'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'owner_id', '00000000-0000-0000-0000-00000000000a',
          'title', 'Usurpation', 'date', '2027-03-11', 'amount_minor', 100, 'currency', 'EUR',
          'fx_rate', 1, 'base_amount_minor', 100))))->0->>'status') = 'error', 'impossible de créer une dépense perso pour autrui');
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok((select count(*) = 1 from public.personal_expenses), 'Alice voit la dépense perso de Bruno');
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000022', 'table', 'personal_expenses', 'op', 'update',
  'id', '70000000-0000-0000-0000-000000000001', 'base_version', 1,
  'data', jsonb_build_object('title', 'modifié par Alice'))))->0->>'status') = 'not_found',
  'Alice ne peut pas modifier la dépense perso de Bruno');

-- ---------------------------------------------------------------------------
-- 9. Storage : fichiers privés par voyage
-- ---------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner)
values ('trip-files', '20000000-0000-0000-0000-000000000001/80000000-0000-0000-0000-000000000001/billet.pdf',
        '00000000-0000-0000-0000-00000000000a');
select tests.login('00000000-0000-0000-0000-00000000000d');
select tests.ok((select count(*) = 1 from storage.objects), 'un membre voit le billet');
select tests.login('00000000-0000-0000-0000-0000000000ee');
select tests.ok((select count(*) = 0 from storage.objects), 'un non-membre ne voit pas le billet');
select tests.throws($$insert into storage.objects (bucket_id, name)
  values ('trip-files', '20000000-0000-0000-0000-000000000001/x/evil.pdf')$$, 'un non-membre ne peut pas déposer');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('trip-files', 'pas-un-uuid/x.pdf')$$,
  'chemin invalide refusé');
reset role;
select tests.ok((select public from storage.buckets where id = 'trip-files') = false, 'bucket privé');

-- Un document ne peut pas pointer vers le stockage d'un autre voyage
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok((public.sync_push(jsonb_build_array(jsonb_build_object(
  'mutation_id', '10000000-0000-0000-0000-000000000030', 'table', 'documents', 'op', 'insert',
  'id', '80000000-0000-0000-0000-000000000002',
  'data', jsonb_build_object('trip_id', '20000000-0000-0000-0000-000000000001', 'title', 'Billet', 'kind', 'file',
          'category', 'train', 'mime_type', 'application/pdf', 'size_bytes', 1000,
          'storage_path', '99999999-0000-0000-0000-000000000001/a.pdf'))))->0->>'status') = 'error',
  'document : chemin de stockage hors voyage refusé');

-- ---------------------------------------------------------------------------
-- 10. Anonyme : aucun accès
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select tests.throws('select * from public.trips', 'anon : pas d''accès aux tables');
select tests.throws($$select public.sync_pull('20000000-0000-0000-0000-000000000001')$$, 'anon : pas d''accès au pull');
reset role;

\o
select format('%s assertions OK', count(*)) from tests.results;
