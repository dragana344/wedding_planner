-- 0051: the packages from the owner's pricing slide (admin brief E3).
-- Stored as ordinary plans; the admin can edit them. Prices live in the
-- description until payments exist (DECISIONS.md). Idempotent: this table is
-- shared across the session's parallel test/dev runs, so re-applying must be
-- a no-op rather than erroring or duplicating rows.

begin;

insert into public.plans (name, description, sort_order)
select v.name, v.description, v.sort_order
from (values
  ('START', 'Бесплатно, го обезбедува ресторанот. Фото и видео се чуваат 15 дена.', 10),
  ('PREMIUM', '20 GB · 2.000 ден. · чување 30 дена · преземање во оригинален квалитет', 20),
  ('PREMIUM+', '50 GB · 4.000 ден. · чување 40 дена · статистика · приоритетна поддршка', 30),
  ('ULTRA', '100 GB · 6.000 ден. · чување 60 дена · напредна статистика · тематски албуми', 40)
) as v(name, description, sort_order)
where not exists (select 1 from public.plans p where p.name = v.name);

-- Every catalogue key (26) for each of the four packages. START loses
-- video_greetings, invitation_all_templates and reports; PREMIUM loses only
-- reports; PREMIUM+ and ULTRA keep everything on. storage_gb and
-- photo_retention_days carry the package's own limit regardless.
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, k,
  case
    when p.name = 'START' and k in ('video_greetings', 'invitation_all_templates', 'reports') then false
    when p.name = 'PREMIUM' and k = 'reports' then false
    else true
  end,
  case k
    when 'storage_gb' then case p.name when 'START' then 5 when 'PREMIUM' then 20 when 'PREMIUM+' then 50 else 100 end
    when 'photo_retention_days' then case p.name when 'START' then 15 when 'PREMIUM' then 30 when 'PREMIUM+' then 40 else 60 end
    else null
  end
from public.plans p,
     unnest(array['invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
                  'budget','checklist','agenda','locations','notes','max_guests',
                  'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
                  'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
                  'storage_gb','photo_retention_days','co_organizers']) as k
where p.name in ('START', 'PREMIUM', 'PREMIUM+', 'ULTRA')
on conflict (plan_id, feature_key) do nothing;

commit;
