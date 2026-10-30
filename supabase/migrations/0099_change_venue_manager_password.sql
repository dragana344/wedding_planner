-- 0099: a manager changing their own password (spec §7's "change own
-- manager password" row) — same hashing as create_venue_manager.

begin;

create or replace function public.change_venue_manager_password(p_manager_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if char_length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Лозинката мора да има најмалку 8 знаци.' using errcode = '22023';
  end if;
  update venue_managers set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)) where id = p_manager_id;
end;
$$;
revoke all on function public.change_venue_manager_password(uuid, text) from public, anon, authenticated;
grant execute on function public.change_venue_manager_password(uuid, text) to service_role;

commit;
