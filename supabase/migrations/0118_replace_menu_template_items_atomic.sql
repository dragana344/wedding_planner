-- 0118: saving a package (Мени / Пакети → package builder) replaced its
-- dishes with two separate calls — delete all, then insert the new set — so
-- a failed insert (e.g. a dish deleted meanwhile, or a dropped connection)
-- left an existing package with no dishes at all.
--
-- One function call is one transaction: the package keeps its old dishes
-- unless the whole replacement succeeds. SECURITY INVOKER on purpose — the
-- caller's RLS ("venue staff manage own menu template items", 0019)
-- still decides which template and which dishes it may touch; staff edit
-- menus directly (spec §3), so no route or elevation is involved.

begin;

create or replace function public.replace_menu_template_items(p_template_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from menu_template_items where menu_template_id = p_template_id;
  insert into menu_template_items (menu_template_id, menu_item_id)
  select p_template_id, item_id
  from unnest(coalesce(p_item_ids, '{}'::uuid[])) as ids(item_id)
  group by item_id;
end;
$$;

revoke all on function public.replace_menu_template_items(uuid, uuid[]) from public, anon;
grant execute on function public.replace_menu_template_items(uuid, uuid[]) to authenticated, service_role;

commit;
