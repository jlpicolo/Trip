-- Supprime les données créées par 10_rls_and_sync.test.sql sur un projet Supabase réel.
-- Les identifiants de test (00000000-…-0000000000xx, @example.com) sont réservés aux tests.
begin;
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'trip-files' and name like '20000000-0000-0000-0000-000000000001/%';
delete from public.travel_groups where id in (select group_id from public.group_members where user_id::text like '00000000-0000-0000-0000-0000000000%');
delete from public.activity_log where trip_id = '20000000-0000-0000-0000-000000000001';
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000000%' and email like '%@example.com';
drop schema if exists tests cascade;
commit;
select (select count(*) from auth.users) users, (select count(*) from public.trips) trips, (select count(*) from public.travel_groups) groups,
       (select count(*) from public.activity_log) logs, (select count(*) from public.applied_mutations) muts,
       (select count(*) from storage.objects) objects, exists(select 1 from pg_namespace where nspname='tests') tests_schema;
