-- =============================================================================
-- Japan Trip — schéma initial
-- -----------------------------------------------------------------------------
-- Principes :
--   * Hiérarchie : comptes (auth.users/profiles) → groupes de voyage → voyages
--     → données du voyage. Aucune notion d'administrateur dans un groupe.
--   * Toutes les tables de données portent : id uuid généré côté client
--     (idempotence), version (verrouillage optimiste), created_by/updated_by,
--     created_at/updated_at, deleted_at (tombstone pour la synchronisation),
--     txid (identifiant de transaction serveur, curseur de synchronisation).
--   * Les métadonnées de synchronisation sont imposées par trigger : un client
--     ne peut pas falsifier l'auteur, la version ni le curseur.
--   * RLS activé sur toutes les tables. L'accès est accordé uniquement aux
--     membres du groupe propriétaire du voyage.
--   * Aucune suppression physique par les clients : suppression logique
--     (deleted_at) pour que les autres appareils reçoivent la suppression.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- Profils (1 ligne par compte)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  avatar_path  text check (avatar_path is null or char_length(avatar_path) <= 300),
  color        text not null default '#e8452c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  locale       text not null default 'fr' check (locale in ('fr', 'en')),
  theme        text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), ''), 60)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Groupes de voyage et membres (tous égaux)
-- -----------------------------------------------------------------------------

create table public.travel_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.travel_groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id);

create table public.group_invitations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.travel_groups(id) on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash  text not null unique,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

-- Fonctions d'appartenance (SECURITY DEFINER pour éviter la récursion RLS).
create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_user_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Métadonnées de synchronisation (trigger générique)
-- -----------------------------------------------------------------------------

create or replace function public.tg_sync_meta()
returns trigger language plpgsql as $$
declare
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    new.version    := 1;
    new.created_at := now();
    new.updated_at := now();
    new.txid       := pg_current_xact_id();
    if v_uid is not null then
      new.created_by := v_uid;
      new.updated_by := v_uid;
    end if;
    return new;
  end if;

  -- UPDATE : verrouillage optimiste. Le client envoie la version sur laquelle
  -- il a basé sa modification ; toute divergence est un conflit explicite.
  if new.version is distinct from old.version then
    raise exception 'version_conflict'
      using errcode = 'JT409',
            detail  = format('expected %s, got %s', old.version, new.version);
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  if v_new->'id' is distinct from v_old->'id'
     or v_new->'trip_id' is distinct from v_old->'trip_id'
     or v_new->'group_id' is distinct from v_old->'group_id' then
    raise exception 'immutable_column' using errcode = 'JT400';
  end if;

  new.version    := old.version + 1;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.txid       := pg_current_xact_id();
  if v_uid is not null then
    new.updated_by := v_uid;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Journal d'activité (« Thomas a ajouté un restaurant à Kyoto »)
-- -----------------------------------------------------------------------------

create table public.activity_log (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null check (action in ('create', 'update', 'delete', 'restore')),
  entity_type text not null,
  entity_id   uuid not null,
  label       text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  txid        xid8 not null default pg_current_xact_id()
);
create index activity_log_trip_idx on public.activity_log(trip_id, created_at desc);
create index activity_log_txid_idx on public.activity_log(trip_id, txid);

create or replace function public.tg_activity_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row    jsonb := to_jsonb(new);
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
  elsif (v_row->>'deleted_at') is not null and (to_jsonb(old)->>'deleted_at') is null then
    v_action := 'delete';
  elsif (v_row->>'deleted_at') is null and (to_jsonb(old)->>'deleted_at') is not null then
    v_action := 'restore';
  else
    v_action := 'update';
  end if;

  insert into public.activity_log (trip_id, actor_id, action, entity_type, entity_id, label, details)
  values (
    coalesce(public.try_uuid(v_row->>'trip_id'), (v_row->>'id')::uuid),
    coalesce(auth.uid(), public.try_uuid(v_row->>'updated_by')),
    v_action,
    tg_table_name,
    (v_row->>'id')::uuid,
    left(coalesce(v_row->>'title', v_row->>'name', v_row->>'carrier', v_row->>'label'), 120),
    jsonb_strip_nulls(jsonb_build_object(
      'category', v_row->>'category',
      'kind',     v_row->>'kind',
      'city',     v_row->>'city',
      'date',     coalesce(v_row->>'date', v_row->>'check_in_date', v_row->>'departure_date')
    ))
  );
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- Voyages
-- -----------------------------------------------------------------------------

create table public.trips (
  id                 uuid primary key,
  group_id           uuid not null references public.travel_groups(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  start_date         date not null,
  end_date           date not null,
  timezone           text not null default 'UTC' check (char_length(timezone) <= 64),
  base_currency      char(3) not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  secondary_currency char(3) check (secondary_currency ~ '^[A-Z]{3}$'),
  locale             text not null default 'fr',
  -- [{id, name, name_local, lat, lng, start_date, end_date}]
  destinations       jsonb not null default '[]'::jsonb check (jsonb_typeof(destinations) = 'array'),
  -- préférences partagées : catégories personnalisées, taux manuel, dashboard…
  settings           jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  version            integer not null default 1,
  created_by         uuid references auth.users(id) on delete set null,
  updated_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  txid               xid8 not null default pg_current_xact_id(),
  check (end_date >= start_date),
  check (end_date - start_date <= 366)
);
create index trips_group_idx on public.trips(group_id);

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trips t
    join public.group_members m on m.group_id = t.group_id
    where t.id = p_trip_id and m.user_id = auth.uid()
  );
$$;

-- Vérifie qu'un utilisateur est membre du groupe propriétaire du voyage
-- (payeur d'une dépense, voyageur associé à un document…).
create or replace function public.is_user_in_trip(p_trip_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trips t
    join public.group_members m on m.group_id = t.group_id
    where t.id = p_trip_id and m.user_id = p_user_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Colonnes communes des données de voyage (répétées explicitement par table)
-- -----------------------------------------------------------------------------

-- Journées (notes du jour, ville, journée libre). Id déterministe côté client
-- (uuid v5 de trip_id + date) pour que deux créations hors ligne fusionnent.
create table public.trip_days (
  id         uuid primary key,
  trip_id    uuid not null references public.trips(id) on delete cascade,
  date       date not null,
  title      text check (char_length(title) <= 120),
  city       text check (char_length(city) <= 80),
  notes      text check (char_length(notes) <= 10000),
  is_free    boolean not null default false,
  version    integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  txid       xid8 not null default pg_current_xact_id(),
  unique (trip_id, date)
);

create table public.places (
  id          uuid primary key,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 160),
  category    text not null default 'other' check (char_length(category) <= 40),
  description text check (char_length(description) <= 10000),
  notes       text check (char_length(notes) <= 10000),
  address     text check (char_length(address) <= 400),
  address_local text check (char_length(address_local) <= 400),
  city        text check (char_length(city) <= 80),
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  url         text check (url is null or url ~* '^https?://'),
  is_favorite boolean not null default false,
  source      text not null default 'manual' check (source in ('manual', 'search', 'import')),
  source_ref  text check (char_length(source_ref) <= 200), -- ex. identifiant OSM
  version     integer not null default 1,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  txid        xid8 not null default pg_current_xact_id(),
  check ((lat is null) = (lng is null))
);

create table public.activities (
  id                uuid primary key,
  trip_id           uuid not null references public.trips(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 160),
  description       text check (char_length(description) <= 10000),
  notes             text check (char_length(notes) <= 10000),
  category          text not null default 'idea' check (char_length(category) <= 40),
  date              date,                 -- null = idée non planifiée
  start_time        time,
  end_time          time,
  duration_minutes  integer check (duration_minutes between 1 and 1440),
  sort_key          double precision not null default 0,
  place_id          uuid references public.places(id) on delete set null,
  url               text check (url is null or url ~* '^https?://'),
  estimated_cost_minor bigint check (estimated_cost_minor >= 0),
  estimated_cost_currency char(3) check (estimated_cost_currency ~ '^[A-Z]{3}$'),
  -- Temps de trajet depuis l'activité précédente : TOUJOURS une estimation
  -- saisie par un voyageur, jamais calculée par l'application.
  travel_minutes_estimate integer check (travel_minutes_estimate between 0 and 1440),
  travel_mode       text check (travel_mode in ('walk', 'train', 'metro', 'bus', 'taxi', 'car', 'bike', 'other')),
  is_done           boolean not null default false,
  journal_entry_id  uuid,                 -- élément du carnet d'origine
  version           integer not null default 1,
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  txid              xid8 not null default pg_current_xact_id(),
  check (start_time is null or date is not null),
  check ((estimated_cost_minor is null) = (estimated_cost_currency is null))
);
create index activities_trip_date_idx on public.activities(trip_id, date, sort_key);

create table public.transports (
  id              uuid primary key,
  trip_id         uuid not null references public.trips(id) on delete cascade,
  kind            text not null check (kind in ('plane', 'train', 'shinkansen', 'metro', 'bus', 'ferry', 'other')),
  carrier         text check (char_length(carrier) <= 120),
  reference       text check (char_length(reference) <= 60),   -- n° de vol / train
  booking_ref     text check (char_length(booking_ref) <= 120),
  departure_date  date not null,
  departure_time  time,
  departure_tz    text check (char_length(departure_tz) <= 64),
  arrival_date    date,
  arrival_time    time,
  arrival_tz      text check (char_length(arrival_tz) <= 64),
  departure_name  text check (char_length(departure_name) <= 160),
  departure_address text check (char_length(departure_address) <= 400),
  departure_place_id uuid references public.places(id) on delete set null,
  arrival_name    text check (char_length(arrival_name) <= 160),
  arrival_address text check (char_length(arrival_address) <= 400),
  arrival_place_id uuid references public.places(id) on delete set null,
  seat_info       text check (char_length(seat_info) <= 400),
  details         text check (char_length(details) <= 10000),
  notes           text check (char_length(notes) <= 10000),
  booking_url     text check (booking_url is null or booking_url ~* '^https?://'),
  carrier_url     text check (carrier_url is null or carrier_url ~* '^https?://'),
  traveler_ids    uuid[] not null default '{}',  -- vide = tout le groupe
  version         integer not null default 1,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  txid            xid8 not null default pg_current_xact_id(),
  check (arrival_date is null or arrival_date >= departure_date)
);

create table public.accommodations (
  id              uuid primary key,
  trip_id         uuid not null references public.trips(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 160),
  address         text check (char_length(address) <= 400),
  address_local   text check (char_length(address_local) <= 400),
  city            text check (char_length(city) <= 80),
  place_id        uuid references public.places(id) on delete set null,
  check_in_date   date not null,
  check_out_date  date not null,
  check_in_time   time,
  check_out_time  time,
  nights          integer generated always as (check_out_date - check_in_date) stored,
  guests          integer check (guests between 1 and 50),
  rooms           text check (char_length(rooms) <= 2000),  -- répartition libre
  booking_ref     text check (char_length(booking_ref) <= 120),
  booking_site    text check (char_length(booking_site) <= 80),
  booking_url     text check (booking_url is null or booking_url ~* '^https?://'),
  phone           text check (char_length(phone) <= 40),
  email           text check (char_length(email) <= 200),
  practical_info  text check (char_length(practical_info) <= 10000),
  notes           text check (char_length(notes) <= 10000),
  version         integer not null default 1,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  txid            xid8 not null default pg_current_xact_id(),
  check (check_out_date > check_in_date)
);

create table public.journal_entries (
  id          uuid primary key,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  category    text not null default 'other' check (char_length(category) <= 40),
  title       text not null check (char_length(title) between 1 and 160),
  body        text check (char_length(body) <= 20000),
  url         text check (url is null or url ~* '^https?://'),
  place_id    uuid references public.places(id) on delete set null,
  city        text check (char_length(city) <= 80),
  priority    smallint check (priority between 1 and 3),
  version     integer not null default 1,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  txid        xid8 not null default pg_current_xact_id()
);

alter table public.activities
  add constraint activities_journal_fk foreign key (journal_entry_id)
  references public.journal_entries(id) on delete set null;

-- Documents : fichiers (PDF/images), liens externes ou codes (QR/barres).
-- Les fichiers sont stockés dans le bucket privé `trip-files` sous
-- `{trip_id}/{document_id}/{nom}` ; la RLS Storage s'appuie sur ce préfixe.
create table public.documents (
  id              uuid primary key,
  trip_id         uuid not null references public.trips(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 160),
  category        text not null default 'other' check (category in
                    ('flight', 'train', 'hotel', 'id', 'insurance', 'confirmation', 'photo', 'other')),
  kind            text not null check (kind in ('file', 'link', 'code')),
  storage_path    text check (char_length(storage_path) <= 400),
  mime_type       text check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes      bigint check (size_bytes between 1 and 26214400), -- 25 Mo
  sha256          text check (sha256 ~ '^[0-9a-f]{64}$'),
  url             text check (url is null or url ~* '^https?://'),
  code_value      text check (char_length(code_value) <= 4000),
  code_format     text check (code_format in ('qrcode', 'azteccode', 'pdf417', 'datamatrix', 'code128', 'ean13', 'code39')),
  scope           text not null default 'group' check (scope in ('group', 'travelers')),
  traveler_ids    uuid[] not null default '{}',
  date            date,
  transport_id    uuid references public.transports(id) on delete set null,
  accommodation_id uuid references public.accommodations(id) on delete set null,
  activity_id     uuid references public.activities(id) on delete set null,
  place_id        uuid references public.places(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  notes           text check (char_length(notes) <= 10000),
  version         integer not null default 1,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  txid            xid8 not null default pg_current_xact_id(),
  check (kind <> 'file' or (storage_path is not null and mime_type is not null)),
  check (kind <> 'link' or url is not null),
  check (kind <> 'code' or (code_value is not null and code_format is not null)),
  check (storage_path is null or split_part(storage_path, '/', 1) = trip_id::text),
  check (scope = 'travelers' or cardinality(traveler_ids) = 0)
);
create index documents_trip_idx on public.documents(trip_id);

-- -----------------------------------------------------------------------------
-- Budget — pot commun
-- Montants en unités mineures (centimes pour EUR, yens pour JPY).
-- base_amount_minor = montant converti dans la devise du voyage au taux
-- `fx_rate` figé à la saisie. shares = répartition en devise de base dont la
-- somme est exactement base_amount_minor (vérifié par trigger).
-- -----------------------------------------------------------------------------

create table public.expenses (
  id                uuid primary key,
  trip_id           uuid not null references public.trips(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 160),
  category          text not null default 'other' check (category in
                      ('transport', 'accommodation', 'food', 'activities', 'shopping', 'other')),
  date              date not null,
  amount_minor      bigint not null check (amount_minor > 0 and amount_minor < 1000000000000),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  fx_rate           numeric(20, 10) not null check (fx_rate > 0), -- 1 unité de `currency` = fx_rate unités de base
  base_amount_minor bigint not null check (base_amount_minor > 0),
  paid_by           uuid not null references auth.users(id),
  split_mode        text not null check (split_mode in ('equal', 'exact', 'shares')),
  -- [{user_id, weight, base_minor}] — weight : 1 (equal), montant saisi en
  -- unités mineures de `currency` (exact) ou proportion (shares).
  shares            jsonb not null check (jsonb_typeof(shares) = 'array' and jsonb_array_length(shares) between 1 and 50),
  notes             text check (char_length(notes) <= 10000),
  version           integer not null default 1,
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  txid              xid8 not null default pg_current_xact_id()
);
create index expenses_trip_idx on public.expenses(trip_id, date);

create or replace function public.tg_validate_expense()
returns trigger language plpgsql as $$
declare
  v_sum   numeric := 0;
  v_share jsonb;
  v_users uuid[] := '{}';
  v_uid   uuid;
begin
  if not public.is_user_in_trip(new.trip_id, new.paid_by) then
    raise exception 'payer_not_member' using errcode = 'JT400';
  end if;
  for v_share in select * from jsonb_array_elements(new.shares) loop
    v_uid := public.try_uuid(v_share->>'user_id');
    if v_uid is null or not public.is_user_in_trip(new.trip_id, v_uid) then
      raise exception 'share_user_not_member' using errcode = 'JT400';
    end if;
    if v_uid = any(v_users) then
      raise exception 'share_user_duplicate' using errcode = 'JT400';
    end if;
    v_users := v_users || v_uid;
    if jsonb_typeof(v_share->'base_minor') <> 'number'
       or (v_share->>'base_minor')::numeric < 0
       or (v_share->>'base_minor')::numeric <> trunc((v_share->>'base_minor')::numeric) then
      raise exception 'share_amount_invalid' using errcode = 'JT400';
    end if;
    if jsonb_typeof(v_share->'weight') <> 'number' or (v_share->>'weight')::numeric < 0 then
      raise exception 'share_weight_invalid' using errcode = 'JT400';
    end if;
    v_sum := v_sum + (v_share->>'base_minor')::numeric;
  end loop;
  if v_sum <> new.base_amount_minor then
    raise exception 'shares_sum_mismatch'
      using errcode = 'JT400', detail = format('sum %s <> total %s', v_sum, new.base_amount_minor);
  end if;
  return new;
end $$;

-- Remboursements effectués entre voyageurs (soldent le pot commun).
create table public.settlements (
  id                uuid primary key,
  trip_id           uuid not null references public.trips(id) on delete cascade,
  from_user         uuid not null references auth.users(id),
  to_user           uuid not null references auth.users(id),
  amount_minor      bigint not null check (amount_minor > 0),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  fx_rate           numeric(20, 10) not null check (fx_rate > 0),
  base_amount_minor bigint not null check (base_amount_minor > 0),
  date              date not null,
  notes             text check (char_length(notes) <= 2000),
  version           integer not null default 1,
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  txid              xid8 not null default pg_current_xact_id(),
  check (from_user <> to_user)
);

create or replace function public.tg_validate_settlement()
returns trigger language plpgsql as $$
begin
  if not public.is_user_in_trip(new.trip_id, new.from_user)
     or not public.is_user_in_trip(new.trip_id, new.to_user) then
    raise exception 'settlement_user_not_member' using errcode = 'JT400';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Budget — dépenses individuelles (table distincte : n'entrent JAMAIS dans le
-- calcul du pot commun). Visibles par le groupe, modifiables par leur auteur.
-- -----------------------------------------------------------------------------

create table public.personal_expenses (
  id                uuid primary key,
  trip_id           uuid not null references public.trips(id) on delete cascade,
  owner_id          uuid not null references auth.users(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 160),
  category          text not null default 'other' check (category in
                      ('purchase', 'food', 'personal', 'souvenir', 'transport', 'other')),
  date              date not null,
  amount_minor      bigint not null check (amount_minor > 0 and amount_minor < 1000000000000),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  fx_rate           numeric(20, 10) not null check (fx_rate > 0),
  base_amount_minor bigint not null check (base_amount_minor > 0),
  notes             text check (char_length(notes) <= 10000),
  version           integer not null default 1,
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  txid              xid8 not null default pg_current_xact_id()
);

-- -----------------------------------------------------------------------------
-- Idempotence de la synchronisation
-- -----------------------------------------------------------------------------

create table public.applied_mutations (
  mutation_id uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  result      jsonb not null,
  applied_at  timestamptz not null default now()
);
create index applied_mutations_user_idx on public.applied_mutations(user_id, applied_at);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'trips', 'trip_days', 'places', 'activities', 'transports', 'accommodations',
    'journal_entries', 'documents', 'expenses', 'settlements', 'personal_expenses'
  ] loop
    execute format('create trigger %I before insert or update on public.%I
                    for each row execute function public.tg_sync_meta()', t || '_sync_meta', t);
    execute format('create trigger %I after insert or update on public.%I
                    for each row execute function public.tg_activity_log()', t || '_activity_log', t);
    execute format('create index %I on public.%I (%s, txid)',
                   t || '_txid_idx', t, case when t = 'trips' then 'id' else 'trip_id' end);
  end loop;
end $$;

create trigger expenses_validate before insert or update on public.expenses
  for each row execute function public.tg_validate_expense();
create trigger settlements_validate before insert or update on public.settlements
  for each row execute function public.tg_validate_settlement();

-- Les voyageurs associés à un transport/document doivent appartenir au voyage.
create or replace function public.tg_validate_travelers()
returns trigger language plpgsql as $$
declare
  v_uid uuid;
begin
  foreach v_uid in array new.traveler_ids loop
    if not public.is_user_in_trip(new.trip_id, v_uid) then
      raise exception 'traveler_not_member' using errcode = 'JT400';
    end if;
  end loop;
  return new;
end $$;
create trigger transports_validate before insert or update on public.transports
  for each row execute function public.tg_validate_travelers();
create trigger documents_validate before insert or update on public.documents
  for each row execute function public.tg_validate_travelers();

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.travel_groups     enable row level security;
alter table public.group_members     enable row level security;
alter table public.group_invitations enable row level security;
alter table public.activity_log      enable row level security;
alter table public.applied_mutations enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy groups_select on public.travel_groups for select to authenticated
  using (public.is_group_member(id));
create policy groups_update on public.travel_groups for update to authenticated
  using (public.is_group_member(id)) with check (public.is_group_member(id));

create policy members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
-- Quitter un groupe : uniquement soi-même. L'ajout passe par une invitation.
create policy members_leave on public.group_members for delete to authenticated
  using (user_id = (select auth.uid()));

create policy invitations_select on public.group_invitations for select to authenticated
  using (public.is_group_member(group_id));
create policy invitations_delete on public.group_invitations for delete to authenticated
  using (public.is_group_member(group_id) and accepted_at is null);

create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_trip_member(trip_id));

create policy applied_mutations_own on public.applied_mutations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Voyages : un voyage ne peut être créé que dans un groupe dont on est membre.
alter table public.trips enable row level security;
create policy trips_select on public.trips for select to authenticated
  using (public.is_group_member(group_id));
create policy trips_insert on public.trips for insert to authenticated
  with check (public.is_group_member(group_id));
create policy trips_update on public.trips for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- Données partagées : tous les membres du voyage ont les mêmes droits.
do $$
declare
  t text;
begin
  foreach t in array array[
    'trip_days', 'places', 'activities', 'transports', 'accommodations',
    'journal_entries', 'documents', 'expenses', 'settlements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (public.is_trip_member(trip_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated
                    with check (public.is_trip_member(trip_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
                    using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id))', t || '_update', t);
  end loop;
end $$;

-- Dépenses individuelles : lecture par le groupe, écriture par le propriétaire.
alter table public.personal_expenses enable row level security;
create policy personal_expenses_select on public.personal_expenses for select to authenticated
  using (public.is_trip_member(trip_id));
create policy personal_expenses_insert on public.personal_expenses for insert to authenticated
  with check (public.is_trip_member(trip_id) and owner_id = (select auth.uid()));
create policy personal_expenses_update on public.personal_expenses for update to authenticated
  using (public.is_trip_member(trip_id) and owner_id = (select auth.uid()))
  with check (public.is_trip_member(trip_id) and owner_id = (select auth.uid()));

-- Aucune politique DELETE sur les données de voyage : suppression logique.

-- =============================================================================
-- RPC : groupes et invitations
-- =============================================================================

create or replace function public.create_group(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'JT401';
  end if;
  insert into travel_groups (name, created_by) values (p_name, v_uid) returning id into v_id;
  insert into group_members (group_id, user_id) values (v_id, v_uid);
  return v_id;
end $$;

-- Crée une invitation et renvoie le jeton en clair (une seule fois) ; seul son
-- hash SHA-256 est stocké.
create or replace function public.create_invitation(p_group_id uuid, p_email text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  if not is_group_member(p_group_id) then
    raise exception 'forbidden' using errcode = 'JT403';
  end if;
  insert into group_invitations (group_id, email, token_hash, invited_by)
  values (p_group_id, lower(trim(p_email)), encode(digest(v_token, 'sha256'), 'hex'), auth.uid());
  return v_token;
end $$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv   group_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'JT401';
  end if;
  select * into v_inv from group_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;
  if not found or v_inv.expires_at < now() then
    raise exception 'invitation_invalid' using errcode = 'JT404';
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_uid then
      return v_inv.group_id; -- idempotent
    end if;
    raise exception 'invitation_used' using errcode = 'JT409';
  end if;
  if v_inv.email <> v_email then
    raise exception 'invitation_email_mismatch' using errcode = 'JT403';
  end if;
  insert into group_members (group_id, user_id) values (v_inv.group_id, v_uid)
  on conflict do nothing;
  update group_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return v_inv.group_id;
end $$;

-- =============================================================================
-- RPC : synchronisation
-- =============================================================================

-- Tables synchronisables et colonnes que le client n'a jamais le droit d'écrire.
create or replace function public.sync_tables()
returns text[] language sql immutable as $$
  select array['trips', 'trip_days', 'places', 'activities', 'transports', 'accommodations',
               'journal_entries', 'documents', 'expenses', 'settlements', 'personal_expenses'];
$$;

-- Applique un lot de mutations. SECURITY INVOKER : la RLS s'applique.
-- Chaque mutation : {mutation_id, table, op: insert|update|delete, id,
--                    base_version (update/delete), data (insert/update)}.
-- Résultat par mutation : {mutation_id, status: ok|conflict|not_found|error,
--                          row?, error?}. Les résultats « ok » sont mémorisés :
-- rejouer le même lot ne réapplique rien (idempotence).
create or replace function public.sync_push(p_mutations jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_m        jsonb;
  v_mid      uuid;
  v_table    text;
  v_op       text;
  v_id       uuid;
  v_data     jsonb;
  v_cols     text[];
  v_collist  text;
  v_row      jsonb;
  v_result   jsonb;
  v_results  jsonb := '[]'::jsonb;
  v_prev     jsonb;
  v_forbidden text[] := array['id', 'version', 'created_by', 'updated_by', 'created_at',
                              'updated_at', 'deleted_at', 'txid', 'nights'];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'JT401';
  end if;
  if jsonb_typeof(p_mutations) <> 'array' or jsonb_array_length(p_mutations) > 200 then
    raise exception 'invalid_batch' using errcode = 'JT400';
  end if;

  for v_m in select * from jsonb_array_elements(p_mutations) loop
    v_mid   := try_uuid(v_m->>'mutation_id');
    v_table := v_m->>'table';
    v_op    := v_m->>'op';
    v_id    := try_uuid(v_m->>'id');
    v_data  := coalesce(v_m->'data', '{}'::jsonb);

    if v_mid is null or v_id is null or not (v_table = any(sync_tables()))
       or v_op not in ('insert', 'update', 'delete') or jsonb_typeof(v_data) <> 'object' then
      v_results := v_results || jsonb_build_object(
        'mutation_id', v_m->>'mutation_id', 'status', 'error', 'error', 'invalid_mutation');
      continue;
    end if;

    select result into v_prev from applied_mutations where mutation_id = v_mid;
    if found then
      v_results := v_results || v_prev;
      continue;
    end if;

    begin
      -- Colonnes autorisées = colonnes réelles ∩ clés envoyées − colonnes protégées.
      select coalesce(array_agg(c.column_name::text order by c.ordinal_position), '{}')
        into v_cols
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = v_table
        and v_data ? c.column_name
        and not (c.column_name = any(v_forbidden))
        and (v_op = 'insert' or c.column_name not in ('trip_id', 'group_id'));

      if v_op = 'insert' then
        v_cols := array_prepend('id', v_cols);
        v_data := v_data || jsonb_build_object('id', v_id);
        select string_agg(quote_ident(x), ', ') into v_collist from unnest(v_cols) x;
        execute format(
          'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)
           on conflict (id) do nothing returning to_jsonb(%1$I.*)', v_table, v_collist)
          into v_row using v_data;
        if v_row is null then
          -- Déjà existant (création concurrente ou id déterministe) : on renvoie
          -- la ligne serveur, le client fusionne.
          execute format('select to_jsonb(t.*) from public.%I t where id = $1', v_table)
            into v_row using v_id;
          v_result := jsonb_build_object('mutation_id', v_mid, 'status',
                        case when v_row is null then 'not_found' else 'conflict' end, 'row', v_row);
        else
          v_result := jsonb_build_object('mutation_id', v_mid, 'status', 'ok', 'row', v_row);
        end if;

      else
        if jsonb_typeof(v_m->'base_version') <> 'number' then
          raise exception 'base_version_required' using errcode = 'JT400';
        end if;
        if v_op = 'delete' then
          execute format(
            'update public.%I t set deleted_at = now(), version = $1 where id = $2
             returning to_jsonb(t.*)', v_table)
            into v_row using (v_m->>'base_version')::int, v_id;
        elsif cardinality(v_cols) = 0 then
          raise exception 'empty_update' using errcode = 'JT400';
        else
          select string_agg(quote_ident(x), ', ') into v_collist from unnest(v_cols) x;
          execute format(
            'update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)),
               version = $2 where id = $3 returning to_jsonb(t.*)', v_table, v_collist)
            into v_row using v_data, (v_m->>'base_version')::int, v_id;
        end if;
        v_result := jsonb_build_object('mutation_id', v_mid,
                      'status', case when v_row is null then 'not_found' else 'ok' end, 'row', v_row);
      end if;

    exception
      when sqlstate 'JT409' then
        execute format('select to_jsonb(t.*) from public.%I t where id = $1', v_table)
          into v_row using v_id;
        v_result := jsonb_build_object('mutation_id', v_mid, 'status', 'conflict', 'row', v_row);
      when others then
        v_result := jsonb_build_object('mutation_id', v_mid, 'status', 'error',
                      'error', sqlerrm, 'code', sqlstate);
    end;

    if v_result->>'status' = 'ok' then
      insert into applied_mutations (mutation_id, user_id, result) values (v_mid, v_uid, v_result);
    end if;
    v_results := v_results || v_result;
  end loop;

  return v_results;
end $$;

-- Renvoie toutes les lignes (y compris supprimées logiquement) modifiées par
-- des transactions dont l'id >= p_cursor, ainsi qu'un nouveau curseur.
-- Le curseur est le xmin du snapshot courant : toute transaction encore en
-- cours au moment du pull a un id >= curseur et sera donc vue au pull suivant
-- (pas de perte en cas de commits concurrents, contrairement à un timestamp).
create or replace function public.sync_pull(p_trip_id uuid, p_cursor text default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_cursor xid8 := coalesce(p_cursor, '0')::xid8;
  v_next   xid8 := pg_snapshot_xmin(pg_current_snapshot());
  v_out    jsonb := '{}'::jsonb;
  v_rows   jsonb;
  t        text;
begin
  if not is_trip_member(p_trip_id) then
    raise exception 'forbidden' using errcode = 'JT403';
  end if;
  foreach t in array sync_tables() loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x.*)), ''[]''::jsonb) from public.%I x
       where %s = $1 and txid >= $2', t, case when t = 'trips' then 'id' else 'trip_id' end)
      into v_rows using p_trip_id, v_cursor;
    v_out := v_out || jsonb_build_object(t, v_rows);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(a.*) order by a.id), '[]'::jsonb) into v_rows
  from (select * from activity_log where trip_id = p_trip_id and txid >= v_cursor
        order by id desc limit 500) a;
  v_out := v_out || jsonb_build_object('activity_log', v_rows);
  return jsonb_build_object('cursor', v_next::text, 'tables', v_out);
end $$;

-- =============================================================================
-- Droits d'exécution
-- =============================================================================

revoke all on function public.create_group(text)               from public, anon;
revoke all on function public.create_invitation(uuid, text)     from public, anon;
revoke all on function public.accept_invitation(text)           from public, anon;
revoke all on function public.sync_push(jsonb)                  from public, anon;
revoke all on function public.sync_pull(uuid, text)             from public, anon;
grant execute on function public.create_group(text)             to authenticated;
grant execute on function public.create_invitation(uuid, text)  to authenticated;
grant execute on function public.accept_invitation(text)        to authenticated;
grant execute on function public.sync_push(jsonb)               to authenticated;
grant execute on function public.sync_pull(uuid, text)          to authenticated;

-- Les clients ne doivent jamais écrire directement les colonnes de
-- métadonnées : elles sont de toute façon réécrites par tg_sync_meta.
revoke all on all tables in schema public from anon;

-- =============================================================================
-- Storage : buckets privés + RLS par préfixe de chemin
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('trip-files', 'trip-files', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('avatars', 'avatars', false, 2097152,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy trip_files_select on storage.objects for select to authenticated
  using (bucket_id = 'trip-files'
         and public.is_trip_member(public.try_uuid((storage.foldername(name))[1])));
create policy trip_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-files'
              and public.is_trip_member(public.try_uuid((storage.foldername(name))[1])));
create policy trip_files_update on storage.objects for update to authenticated
  using (bucket_id = 'trip-files'
         and public.is_trip_member(public.try_uuid((storage.foldername(name))[1])));
create policy trip_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-files'
         and public.is_trip_member(public.try_uuid((storage.foldername(name))[1])));

create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and (public.try_uuid((storage.foldername(name))[1]) = (select auth.uid())
              or public.shares_group_with(public.try_uuid((storage.foldername(name))[1]))));
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
              and public.try_uuid((storage.foldername(name))[1]) = (select auth.uid()));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars'
         and public.try_uuid((storage.foldername(name))[1]) = (select auth.uid()));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
         and public.try_uuid((storage.foldername(name))[1]) = (select auth.uid()));
