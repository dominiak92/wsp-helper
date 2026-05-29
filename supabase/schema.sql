-- WSP Command Center — schemat bazy danych
-- Wklej w: Supabase → SQL Editor → New query

-- Tabela: stan osobowy
create table if not exists personnel (
  id                   text primary key,
  name                 text not null,
  roles                text[] not null default '{}',
  preferred_vehicle_id text,
  absence              text,
  created_at           timestamptz default now()
);

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
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

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
  lat          double precision not null,
  lng          double precision not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz default now()
);

alter table live_locations enable row level security;

create policy "public read live_locations"
  on live_locations for select using (true);

create policy "public write live_locations"
  on live_locations for all using (true);
