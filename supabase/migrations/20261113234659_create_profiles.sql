create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  phone text not null check (char_length(btrim(phone)) between 1 and 50),
  mailing_address text not null check (char_length(btrim(mailing_address)) between 1 and 1000)
);

alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.create_profile_from_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(new.raw_user_meta_data ->> 'name'), '') is not null
    and nullif(btrim(new.raw_user_meta_data ->> 'phone'), '') is not null
    and nullif(btrim(new.raw_user_meta_data ->> 'mailing_address'), '') is not null then
    insert into public.profiles (id, name, phone, mailing_address)
    values (
      new.id,
      btrim(new.raw_user_meta_data ->> 'name'),
      btrim(new.raw_user_meta_data ->> 'phone'),
      btrim(new.raw_user_meta_data ->> 'mailing_address')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.create_profile_from_signup() from public, anon, authenticated;

create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_from_signup();
