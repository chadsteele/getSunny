create table public.sunny_profiles (
  user_id text primary key not null,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100)
);

alter table public.sunny_profiles enable row level security;
revoke all on public.sunny_profiles from public, anon, authenticated;
grant all on public.sunny_profiles to service_role;
