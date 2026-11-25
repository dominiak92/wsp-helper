-- Terminy ważności strażaków: komora dymowa, medyk (KPP), badania okresowe + własne terminy.
-- Zakładka „Terminy” (/qualifications, /mobile/qualifications), push-przypomnienia
-- z netlify/functions/qualifications-remind.js.
-- Idempotentne — można uruchomić ponownie.

-- Funkcja triggera updated_at (jest w schema.sql — tu na wypadek, gdyby jej brakowało)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists qualifications (
  id                  uuid primary key default gen_random_uuid(),
  person_id           text not null references personnel(id) on delete cascade,
  kind                text not null,                 -- 'komora' | 'medyk' | 'badania' | 'custom'
  label               text,                          -- nazwa własnego terminu (kind = 'custom')
  valid_until         date,                          -- ważne do (włącznie)
  remind_days         integer not null default 182,  -- ile dni wcześniej przypominać
  pending_valid_until date,                          -- nowa data zgłoszona przez strażaka, czeka na zatwierdzenie
  pending_by          text,                          -- login zgłaszającego
  pending_at          timestamptz,
  approved_by         text,                          -- login zatwierdzającego / ustawiającego datę
  approved_at         timestamptz,
  notified_stage      text,                          -- ostatni wysłany push: 'window' | 'month' | 'week' | 'expired'
  commander_notified  text,                          -- ostatni push do dowódców zmiany: 'window' | 'expired'
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table qualifications add column if not exists commander_notified text;

-- Ustawienia (jeden wiersz, id = 1): ile dni przed końcem terminu KAŻDEGO strażaka
-- dowódcy zmiany dostają powiadomienie — jedna wartość dla wszystkich.
create table if not exists qualification_settings (
  id                    integer primary key default 1 check (id = 1),
  commander_remind_days integer not null default 182,
  updated_by            text,
  updated_at            timestamptz default now()
);

insert into qualification_settings (id) values (1) on conflict (id) do nothing;

alter table qualification_settings enable row level security;

drop policy if exists "public read qualification_settings" on qualification_settings;
create policy "public read qualification_settings"
  on qualification_settings for select using (true);

drop policy if exists "public write qualification_settings" on qualification_settings;
create policy "public write qualification_settings"
  on qualification_settings for all using (true);

-- Jeden wpis danego standardowego rodzaju na osobę (własnych może być dowolnie wiele)
create unique index if not exists qualifications_person_kind_uniq
  on qualifications (person_id, kind) where kind <> 'custom';

drop trigger if exists qualifications_updated_at on qualifications;
create trigger qualifications_updated_at
  before update on qualifications
  for each row execute function update_updated_at();

alter table qualifications enable row level security;

drop policy if exists "public read qualifications" on qualifications;
create policy "public read qualifications"
  on qualifications for select using (true);

drop policy if exists "public write qualifications" on qualifications;
create policy "public write qualifications"
  on qualifications for all using (true);

-- Dane startowe z papierowej rozpiski (stan na 2026-11-25). Wpisy dla osób,
-- których id nie ma w personnel, są pomijane; istniejące wpisy nie są nadpisywane.
insert into qualifications (person_id, kind, valid_until)
select v.person_id, v.kind, v.valid_until::date
from (values
  ('lukasz_s',     'komora',  '2029-01-27'), ('lukasz_s',     'medyk', '2028-12-14'), ('lukasz_s',     'badania', '2027-01-21'),
  ('michal_l',     'komora',  '2029-09-28'), ('michal_l',     'medyk', '2028-11-09'), ('michal_l',     'badania', '2027-01-09'),
  ('andrzej_s',    'komora',  '2029-09-29'), ('andrzej_s',    'medyk', '2028-07-27'), ('andrzej_s',    'badania', '2027-08-20'),
  ('sebastian_d',  'komora',  '2028-03-30'), ('sebastian_d',  'medyk', '2028-06-29'), ('sebastian_d',  'badania', '2027-03-17'),
  ('pawel_t',      'komora',  '2028-05-07'), ('pawel_t',      'medyk', '2028-04-13'), ('pawel_t',      'badania', '2027-11-06'),
  ('mateusz_m',    'komora',  '2029-09-07'), ('mateusz_m',    'medyk', '2029-05-29'), ('mateusz_m',    'badania', '2027-04-08'),
  ('maciej_s',     'komora',  '2029-06-12'), ('maciej_s',     'medyk', '2027-06-16'), ('maciej_s',     'badania', '2027-10-21'),
  ('andrzej_r',    'komora',  '2028-04-23'), ('andrzej_r',    'medyk', '2029-03-15'), ('andrzej_r',    'badania', '2031-02-03'),
  ('artur_r',      'komora',  '2029-04-20'), ('artur_r',      'medyk', '2029-03-15'), ('artur_r',      'badania', '2029-08-28'),
  ('maciej_sz',    'komora',  '2028-04-23'), ('maciej_sz',    'medyk', '2027-03-23'), ('maciej_sz',    'badania', '2027-02-07'),
  ('jaroslaw_k',   'komora',  '2028-05-07'), ('jaroslaw_k',   'medyk', '2027-07-28'), ('jaroslaw_k',   'badania', '2028-09-05'),
  ('aleksander_k', 'komora',  '2028-04-23'), ('aleksander_k', 'medyk', '2029-09-28'), ('aleksander_k', 'badania', '2028-08-15'),
  ('zbigniew_c',   'komora',  '2029-11-21'), ('zbigniew_c',   'medyk', '2029-09-28'), ('zbigniew_c',   'badania', '2029-02-03'),
  ('waldemar_w',   'komora',  '2028-04-23'), ('waldemar_w',   'medyk', '2028-03-02'), ('waldemar_w',   'badania', '2028-02-07')
) as v(person_id, kind, valid_until)
where exists (select 1 from personnel p where p.id = v.person_id)
on conflict (person_id, kind) where kind <> 'custom' do nothing;

-- Kontrola po uruchomieniu — osoby bez żadnego terminu (np. inne id niż w rozpisce):
-- select p.id, p.name from personnel p
-- where not exists (select 1 from qualifications q where q.person_id = p.id);
