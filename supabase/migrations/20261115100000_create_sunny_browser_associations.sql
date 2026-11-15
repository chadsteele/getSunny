create table public.sunny_browser_associations (
  initial_uid uuid not null,
  user_id text not null references public.sunny_profiles (user_id),
  created_at timestamptz not null default now(),
  primary key (initial_uid, user_id)
);

alter table public.sunny_browser_associations enable row level security;
revoke all on public.sunny_browser_associations from public, anon, authenticated;
grant all on public.sunny_browser_associations to service_role;
