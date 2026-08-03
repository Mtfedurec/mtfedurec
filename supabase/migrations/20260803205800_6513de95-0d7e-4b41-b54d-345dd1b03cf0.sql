-- Grant the first staff account admin, everyone else teacher, on signup.
create or replace function public.assign_default_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'teacher')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_default_role on public.profiles;
create trigger trg_profiles_default_role
after insert on public.profiles
for each row execute function public.assign_default_role();
