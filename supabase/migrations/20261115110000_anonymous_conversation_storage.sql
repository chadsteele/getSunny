create table public.sunny_anonymous_users (
  initial_uid uuid primary key,
  credential_hash text not null,
  updated_at timestamptz not null default now()
);

create table public.sunny_sessions (
  initial_uid uuid not null references public.sunny_anonymous_users (initial_uid),
  path text not null,
  primary key (initial_uid, path)
);

create table public.sunny_chat_messages (
  initial_uid uuid not null,
  session_path text not null,
  message_id bigint not null,
  message jsonb not null,
  primary key (initial_uid, session_path, message_id),
  foreign key (initial_uid, session_path)
    references public.sunny_sessions (initial_uid, path)
);

create table public.sunny_chat_reports (
  initial_uid uuid not null references public.sunny_anonymous_users (initial_uid),
  ordinal bigint not null,
  report jsonb not null,
  primary key (initial_uid, ordinal)
);

alter table public.sunny_anonymous_users enable row level security;
alter table public.sunny_sessions enable row level security;
alter table public.sunny_chat_messages enable row level security;
alter table public.sunny_chat_reports enable row level security;
revoke all on public.sunny_anonymous_users, public.sunny_sessions,
  public.sunny_chat_messages, public.sunny_chat_reports from public, anon, authenticated;
grant all on public.sunny_anonymous_users, public.sunny_sessions,
  public.sunny_chat_messages, public.sunny_chat_reports to service_role;

create function public.sunny_sync_anonymous(
  p_initial_uid uuid, p_credential_hash text, p_sessions jsonb, p_reports jsonb
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actual_hash text;
  session_item jsonb;
  message_item jsonb;
begin
  if p_credential_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_sessions) <> 'array' or jsonb_typeof(p_reports) <> 'array' then
    raise exception 'Invalid synchronization data';
  end if;
  insert into public.sunny_anonymous_users (initial_uid, credential_hash)
    values (p_initial_uid, p_credential_hash) on conflict do nothing;
  select credential_hash into actual_hash from public.sunny_anonymous_users
    where initial_uid = p_initial_uid for update;
  if actual_hash <> p_credential_hash then
    return false;
  end if;

  delete from public.sunny_chat_messages where initial_uid = p_initial_uid;
  delete from public.sunny_sessions where initial_uid = p_initial_uid;
  delete from public.sunny_chat_reports where initial_uid = p_initial_uid;

  for session_item in select value from jsonb_array_elements(p_sessions) loop
    insert into public.sunny_sessions (initial_uid, path)
      values (p_initial_uid, session_item->>'path');
    for message_item in select value from jsonb_array_elements(session_item->'messages') loop
      insert into public.sunny_chat_messages (initial_uid, session_path, message_id, message)
        values (p_initial_uid, session_item->>'path', (message_item->>'id')::bigint, message_item);
    end loop;
  end loop;
  insert into public.sunny_chat_reports (initial_uid, ordinal, report)
    select p_initial_uid, ordinality, value
    from jsonb_array_elements(p_reports) with ordinality;
  update public.sunny_anonymous_users set updated_at = now() where initial_uid = p_initial_uid;
  return true;
end;
$$;
revoke all on function public.sunny_sync_anonymous(uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sunny_sync_anonymous(uuid, text, jsonb, jsonb) to service_role;
