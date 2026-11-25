-- Zapis na termin („zapisany na komorę 12.03”): zaplanowany dzień odnowienia.
-- Póki zapis jest aktualny (planned_on >= dziś), termin jest „Zaplanowane” (niebieski),
-- przypomnienia o nim milkną, a dzień wcześniej idzie push „Jutro: …”.
-- Czyszczony przy zatwierdzeniu nowej daty ważności.
-- Idempotentne — można uruchomić ponownie.

alter table qualifications add column if not exists planned_on date;
alter table qualifications add column if not exists planned_by text;
