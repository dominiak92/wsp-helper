-- WSP Command Center — schemat bazy danych
-- Wklej w: Supabase → SQL Editor → New query
--
-- UWAGA: to migawka startowa (bootstrap). NIE uruchamiaj całości ponownie na produkcji
-- (create trigger / create policy nie są idempotentne). Nowe zmiany → supabase/migrations/.

-- Tabela: stan osobowy
create table if not exists personnel (
  id                   text primary key,
  name                 text not null,
  roles                text[] not null default '{}',
  preferred_vehicle_id text,
  absence              text,
  is_soldier           boolean not null default false, -- true = żołnierz (liczony w kalkulatorze godzin)
  hours_seed           integer not null default 0,     -- saldo godzin przeniesione na start śledzenia
  rank                 text,                            -- stopień/funkcja (np. 'st. sierż.', 'ratownik') — grafik
  created_at           timestamptz default now()
);

-- Gdy tabela już istnieje (migracja):
alter table personnel add column if not exists is_soldier boolean not null default false;
alter table personnel add column if not exists hours_seed integer not null default 0;
alter table personnel add column if not exists rank text;

-- Tabela: przydziały obsady (per dzień/zmiana)
create table if not exists duty_assignments (
  id              uuid primary key default gen_random_uuid(),
  duty_date       date not null unique,
  assignment_json jsonb not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger duty_assignments_updated_at
  before update on duty_assignments
  for each row execute function update_updated_at();

-- Dane startowe (14 osób — IDs zgodne z crew.ts)
insert into personnel (id, name, roles, preferred_vehicle_id, absence) values
  ('lukasz_s',     'Łukasz S.',     array['SHIFT_COMMANDER'],                             null,       null),
  ('michal_l',     'Michał Ł.',     array['SHIFT_COMMANDER', 'VEHICLE_COMMANDER'],         null,       null),
  ('andrzej_s',    'Andrzej S.',    array['SHIFT_COMMANDER', 'VEHICLE_COMMANDER'],         null,       null),
  ('sebastian_d',  'Sebastian D.',  array['DUTY_OFFICER'],                                null,       null),
  ('mateusz_m',    'Mateusz M.',    array['DUTY_OFFICER'],                                null,       null),
  ('maciej_s',     'Maciej S.',     array['RESCUER'],                                     null,       null),
  ('pawel_t',      'Paweł T.',      array['RESCUER'],                                     null,       null),
  ('waldemar_w',   'Waldemar W.',   array['RESCUER'],                                     null,       null),
  ('maciej_sz',    'Maciej Sz.',    array['RESCUER'],                                     null,       null),
  ('zbigniew_c',   'Zbigniew C.',   array['RESCUER'],                                     null,       null),
  ('jaroslaw_k',   'Jarosław K.',   array['DRIVER_RESCUER'],                              'gcba1060', null),
  ('aleksander_k', 'Aleksander K.', array['DRIVER_RESCUER'],                              null,       null),
  ('andrzej_r',    'Andrzej R.',    array['DRIVER_RESCUER'],                              null,       null),
  ('artur_r',      'Artur R.',      array['DRIVER_RESCUER'],                              null,       null)
on conflict (id) do nothing;

-- RLS (Row Level Security) — publiczny dostęp (bez auth)
alter table personnel enable row level security;
alter table duty_assignments enable row level security;

create policy "public read personnel"
  on personnel for select using (true);

create policy "public write personnel"
  on personnel for all using (true);

create policy "public read duty_assignments"
  on duty_assignments for select using (true);

create policy "public write duty_assignments"
  on duty_assignments for all using (true);

-- Tabela: obiekty mapy ppoż. (punkty wody, drogi poż., jednostki, ważne punkty)
-- geometry: punkt {"type":"point","lat":..,"lng":..} lub linia {"type":"line","points":[[lat,lng],..]}
create table if not exists map_features (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                 -- 'water' | 'unit' | 'poi' | 'road'
  label       text not null,
  description text,
  geometry    jsonb not null,
  confirmed   boolean not null default false, -- false = pozycja przybliżona (do dociągnięcia)
  icon        text,                           -- własna ikona (emoji) dla ważnych punktów
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Gdy tabela już istnieje (migracja):
alter table map_features add column if not exists icon text;

create trigger map_features_updated_at
  before update on map_features
  for each row execute function update_updated_at();

alter table map_features enable row level security;

create policy "public read map_features"
  on map_features for select using (true);

create policy "public write map_features"
  on map_features for all using (true);

-- Tabela: pulsujące punkty alarmowe (widoczne dla wszystkich, auto-wygasają po 2h)
create table if not exists map_alerts (
  id          uuid primary key default gen_random_uuid(),
  description text not null,
  lat         double precision not null,
  lng         double precision not null,
  created_by  text,
  created_at  timestamptz default now(),
  expires_at  timestamptz not null default (now() + interval '2 hours')
);

alter table map_alerts enable row level security;

create policy "public read map_alerts"
  on map_alerts for select using (true);

create policy "public write map_alerts"
  on map_alerts for all using (true);

-- Tabela: udostępniane na żywo lokalizacje (1 wiersz na użytkownika, wygasa po 30 min)
create table if not exists live_locations (
  user_login   text primary key,
  display_name text,
  vehicle      text,
  lat          double precision not null,
  lng          double precision not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz default now()
);

-- Gdy tabela już istnieje (migracja):
alter table live_locations add column if not exists vehicle text;

alter table live_locations enable row level security;

create policy "public read live_locations"
  on live_locations for select using (true);

create policy "public write live_locations"
  on live_locations for all using (true);

-- Tabela: godziny służbowe żołnierzy (kalkulator godzin / rozliczenie 28-dniowe)
-- Jeden kod na osobę na dzień. code ∈ '24' | '8' | 'W' | 'WH' | '8W' | 'L4' | 'UN' | 'oddelegowanie'
create table if not exists work_hours (
  person_id  text not null,
  date       date not null,
  code       text not null,
  updated_at timestamptz default now(),
  primary key (person_id, date)
);

alter table work_hours enable row level security;

create policy "public read work_hours"
  on work_hours for select using (true);

create policy "public write work_hours"
  on work_hours for all using (true);

-- Tabela: terminy ważności (komora dymowa, medyk/KPP, badania okresowe + własne)
-- Migracja z danymi startowymi: migrations/202611251200_qualifications.sql
create table if not exists qualifications (
  id                  uuid primary key default gen_random_uuid(),
  person_id           text not null references personnel(id) on delete cascade,
  kind                text not null,                 -- 'komora' | 'medyk' | 'badania' | 'custom'
  label               text,                          -- nazwa własnego terminu (kind = 'custom')
  valid_until         date,                          -- ważne do (włącznie)
  remind_days         integer not null default 182,  -- ile dni wcześniej przypominać
  pending_valid_until date,                          -- nowa data zgłoszona przez strażaka, czeka na zatwierdzenie
  pending_by          text,
  pending_at          timestamptz,
  approved_by         text,
  approved_at         timestamptz,
  notified_stage      text,                          -- ostatni wysłany push: 'window' | 'month' | 'week' | 'expired'
  commander_notified  text,                          -- ostatni push do dowódców zmiany: 'window' | 'expired'
  planned_on          date,                          -- zapis na termin (np. komora 12.03) — migrations/202611251600
  planned_by          text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create unique index if not exists qualifications_person_kind_uniq
  on qualifications (person_id, kind) where kind <> 'custom';

-- Ustawienia terminów (jeden wiersz): ile dni wcześniej powiadamiać dowódców zmiany
create table if not exists qualification_settings (
  id                    integer primary key default 1 check (id = 1),
  commander_remind_days integer not null default 182,
  updated_by            text,
  updated_at            timestamptz default now()
);

insert into qualification_settings (id) values (1) on conflict (id) do nothing;

alter table qualification_settings enable row level security;

create policy "public read qualification_settings"
  on qualification_settings for select using (true);

create policy "public write qualification_settings"
  on qualification_settings for all using (true);

-- Tabela: jak często przypominać (per użytkownik) — migrations/202611251500_notification_prefs.sql
create table if not exists notification_prefs (
  user_login        text primary key,
  own_repeat_days   integer not null default 30,  -- moje terminy: powtarzaj co N dni (0 = tylko kluczowe momenty)
  own_last_sent     date,
  crew_repeat_days  integer not null default 7,   -- dowódcy: co N dni; 0 = tylko nowe; -1 = w dni mojej służby
  crew_last_sent    date,
  updated_at        timestamptz default now()
);

alter table notification_prefs enable row level security;

create policy "public read notification_prefs"
  on notification_prefs for select using (true);

create policy "public write notification_prefs"
  on notification_prefs for all using (true);

create trigger qualifications_updated_at
  before update on qualifications
  for each row execute function update_updated_at();

alter table qualifications enable row level security;

create policy "public read qualifications"
  on qualifications for select using (true);

create policy "public write qualifications"
  on qualifications for all using (true);
