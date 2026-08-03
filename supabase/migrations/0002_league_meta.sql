-- Adds commissioner-editable metadata to leagues:
--   logo_url      : optional league logo shown in the header
--   announcement  : optional public announcement shown on the league home
alter table public.leagues
  add column if not exists logo_url text,
  add column if not exists announcement text;
