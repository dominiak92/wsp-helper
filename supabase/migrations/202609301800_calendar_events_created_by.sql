-- Autor notatek dodawanych z telefonu („Notatka — widoczna dla wszystkich").
-- Login użytkownika; pozwala mu usunąć własną notatkę. Wydarzenia dodane przez admina
-- w kalendarzu służb i starsze notatki mają NULL.
-- Idempotentne — można uruchomić ponownie.
alter table calendar_events add column if not exists created_by text;
