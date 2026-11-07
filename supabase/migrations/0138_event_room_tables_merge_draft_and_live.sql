-- 0138: event_room_tables assumed "draft XOR live" — true only because the
-- old confirm cleared the draft the moment it wrote event_layout_elements,
-- so the two states never coexisted. Project A's no-locking send/approve
-- flow (0136) stopped clearing the draft: a couple keeps editing after
-- sending, and staff can still add tables straight to the live layout at
-- any time (e.g. after approving a proposal).
--
-- But event_layout_elements is not purely "post-approval content": the
-- couple's very first draft open seeds it as a live mirror of the standard
-- layout too (lib/couple/seating.ts's getOrInitDraft, via
-- initializeEventLayoutFromStandard — reusing the same stable ids), and
-- every later draft edit (move/add/delete/revert-to-standard) only touches
-- the draft, leaving that original seed stale in event_layout_elements.
-- Surfacing all of live unconditionally resurrects those stale rows (e.g.
-- after revert-to-standard, whose fresh draft ids never existed in live).
--
-- The one point where event_layout_elements legitimately becomes a second,
-- independent source of truth is once a proposal for the room has actually
-- been approved: confirm_event_seating then copied that round's draft into
-- event_layout_elements, so from then on anything staff adds straight to
-- the live layout (not mirrored into the draft) is real and must stay
-- visible. Before any approval has ever happened for the room, live is
-- still just that stale initial mirror, so it stays hidden exactly like the
-- old exists-gate did.
--
-- This also fixes two latent bugs in prune_event_seat_assignments and
-- seats_affected_by_table_type, which both read event_room_tables: a seat on
-- a genuinely live-only table (added after an approval) used to be silently
-- pruned (or skipped when checking a table type's affected seats) whenever
-- the room also had a draft.

create or replace function public.event_room_tables(p_event_id uuid, p_room_id uuid)
returns table (element_id uuid, table_type_id uuid, label text, ord integer, capacity integer)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  with ev as (
    select seating_draft -> p_room_id::text as draft
    from public.events where id = p_event_id
  ),
  draft as (
    select (e.value ->> 'id')::uuid as element_id,
           nullif(e.value ->> 'table_type_id', '')::uuid as table_type_id,
           nullif(btrim(e.value ->> 'label'), '') as label,
           coalesce(nullif(e.value ->> 'table_role', ''), 'guest') as table_role,
           e.ordinality as pos
    from ev
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(ev.draft) = 'array' then ev.draft else '[]'::jsonb end
    ) with ordinality as e(value, ordinality)
    where e.value ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and nullif(e.value ->> 'table_type_id', '') is not null
  ),
  live as (
    select el.id as element_id, el.table_type_id, nullif(btrim(el.label), '') as label, el.table_role,
           row_number() over (order by el.created_at, el.id) as pos
    from public.event_layout_elements el
    where el.event_id = p_event_id and el.room_id = p_room_id and el.table_type_id is not null
      and (
        not exists (select 1 from ev where jsonb_typeof(ev.draft) = 'array')
        or exists (
          select 1 from public.event_seating_proposals p
          where p.event_id = p_event_id and p.room_id = p_room_id and p.status = 'approved'
        )
      )
  ),
  merged as (
    select d.element_id, d.table_type_id, d.label, d.table_role, d.pos from draft d
    union all
    select l.element_id, l.table_type_id, l.label, l.table_role,
           (select coalesce(max(d.pos), 0) from draft d) + l.pos as pos
    from live l
    where not exists (select 1 from draft d where d.element_id = l.element_id)
  ),
  typed as (
    select m.*, tt.seats,
           case when m.label = tt.name then null else m.label end as own_label
    from merged m
    join public.table_types tt on tt.id = m.table_type_id and tt.room_id = p_room_id
  )
  select t.element_id, t.table_type_id,
         coalesce(t.own_label, table_role_name(t.table_role)) as label,
         case when t.table_role = 'guest'
              then (row_number() over (partition by t.table_role = 'guest' order by t.pos))::integer
              else 0 end as ord,
         t.seats as capacity
  from typed t
  order by t.pos;
$$;

revoke all on function public.event_room_tables(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_room_tables(uuid, uuid) to service_role;
