-- Jak często przypominać o terminach (zakładka „Terminy” → „Ustawienia przypomnień”).
-- Jeden wiersz na użytkownika (login); brak wiersza = wartości domyślne.
-- own_*  — przypomnienia o MOICH terminach (powtarzaj co N dni, gdy są w okresie przypomnienia)
-- crew_* — dla dowódców zmiany i adminów: przypomnienia o terminach strażaków
--          (N dni; 0 = tylko gdy dojdzie nowy termin; -1 = w dni, gdy jestem dowódcą zmiany)
-- *_last_sent — kiedy funkcja qualifications-remind ostatnio wysłała przypomnienie (licznik powtórek).
-- Idempotentne — można uruchomić ponownie.

create table if not exists notification_prefs (
  user_login        text primary key,
  own_repeat_days   integer not null default 30,
  own_last_sent     date,
  crew_repeat_days  integer not null default 7,
  crew_last_sent    date,
  updated_at        timestamptz default now()
);

alter table notification_prefs enable row level security;

drop policy if exists "public read notification_prefs" on notification_prefs;
create policy "public read notification_prefs"
  on notification_prefs for select using (true);

drop policy if exists "public write notification_prefs" on notification_prefs;
create policy "public write notification_prefs"
  on notification_prefs for all using (true);
