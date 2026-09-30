// Column classification for the DATA-005 privacy guard (privacy_guard.test.ts)
// and the erasure checks (privacy.test.ts).
//
// Source of truth: docs/production/DATA-MAP.md.
//
//   personal  identifies or describes a person; exported, and gone after the
//             subject's erasure (event erasure or account deletion)
//   context   personal only in context (dates, finance, party sizes); exported,
//             KEPT on event erasure so the venue's calendar and reports stay
//             intact (owner decision, see docs/production/RETENTION.md), gone
//             on account deletion
//   secret    credentials and access tokens; never exported, gone after erasure
//   none      not personal

export type ColumnClass = "personal" | "context" | "secret" | "none";

const P = "personal" as const;
const C = "context" as const;
const S = "secret" as const;
const N = "none" as const;

export const COLUMN_CLASSIFICATION: Record<string, Record<string, ColumnClass>> = {
  audit_log: { id: N, occurred_at: N, actor_type: N, actor_id: C, action: N, venue_id: N, event_id: N, target_id: N, request_id: N, details: N },
  contact_submissions: { id: N, name: P, email: P, message: P, created_at: C },
  couple_sessions: { token: S, event_id: N, created_at: N, expires_at: N },
  event_agenda_items: { id: N, event_id: N, time: C, title: P, notes: P, sort_order: N, created_at: N },
  event_budget_items: { id: N, event_id: N, category: C, custom_label: P, name: P, estimated_amount: C, paid_amount: C, created_at: N },
  event_checklist_items: { id: N, event_id: N, title: P, due_date: C, is_done: N, created_at: N },
  event_checklist_subtasks: { id: N, checklist_item_id: N, title: P, is_done: N, created_at: N },
  event_credentials: { event_id: N, username: P, password_hash: S, failed_attempts: N, locked_until: N, created_at: N },
  event_custom_menu_items: { event_id: N, menu_item_id: C },
  event_guests: {
    id: N, event_id: N, full_name: P, phone: P, party_size: C, rsvp_status: C, notes: P, created_at: N, side: P,
    rsvp_changed_via_link_at: C, rsvp_previous_status: C,
  },
  event_invitations: { event_id: N, template_id: N, message: P, photo_path: P, public_slug: S, created_at: N },
  event_layout_elements: {
    id: N, event_id: N, room_id: N, element_type: N, table_type_id: N, x_cm: N, y_cm: N, width_cm: N, length_cm: N,
    rotation_deg: N, label: P, created_at: N, group_id: N, table_role: N,
  },
  event_locations: { id: N, event_id: N, label: P, address: P, map_url: P, sort_order: N, created_at: N },
  event_menu_item_quantities: { event_id: N, menu_item_id: C, guest_count: C },
  event_notes: { id: N, event_id: N, title: P, content: P, created_at: N, updated_at: N },
  event_rooms: { event_id: N, room_id: N, layout_initialized_at: N },
  event_seat_assignments: {
    id: N, event_id: N, room_id: N, layout_element_id: N, seat_number: N, guest_id: N, guest_name: P, updated_at: N,
  },
  event_showcase_photos: { id: N, event_id: N, photo_path: P, created_at: N },
  events: {
    id: N, venue_id: N, couple_names: P, event_date: C, guest_count_estimate: C, menu_template_id: N, created_at: N,
    layout_undo_snapshot: P, contact_email: P, contact_email_2: P, contact_phone: P, start_time: C, end_time: C,
    status: C, event_type: C, seating_draft: P, seating_draft_undo: P, seating_confirmed_at: N, total_price: C,
    deposit_paid: C, checklist_seeded_at: N, personal_data_erased_at: N, seating_history: P, layout_history: P, seating_rev: N,
  },
  menu_items: {
    id: N, course: N, name: N, allergen_tags: N, is_vegetarian: N, is_vegan: N, created_at: N, price: N, photo_path: N,
    venue_id: N, tiers: N,
  },
  menu_template_items: { menu_template_id: N, menu_item_id: N },
  menu_templates: { id: N, venue_id: N, name: N, description: N, created_at: N },
  rate_limits: { key: N, window_start: N, hits: N },
  reservation_tables: { reservation_id: N, layout_element_id: N, span: N, active: N },
  reservations: {
    id: N, venue_id: N, room_id: N, guest_name: P, phone: P, email: P, date: C, start_time: C, end_time: C,
    party_size: C, status: C, event_type: C, note: P, created_at: N,
  },
  room_fixed_elements: {
    id: N, room_id: N, element_type: N, x_cm: N, y_cm: N, width_cm: N, height_cm: N, rotation_deg: N, label: N, created_at: N,
  },
  room_layout_elements: {
    id: N, room_id: N, element_type: N, table_type_id: N, x_cm: N, y_cm: N, width_cm: N, length_cm: N, rotation_deg: N,
    label: N, created_at: N, group_id: N, table_role: N,
  },
  rooms: { id: N, venue_id: N, name: N, layout_scale_px_per_meter: N, layout_zones: N, created_at: N, width_cm: N, height_cm: N },
  storage_cleanup_queue: { id: N, bucket: N, path: N, queued_at: N },
  table_types: { id: N, room_id: N, name: N, shape: N, seats: N, width_cm: N, length_cm: N, quantity: N, created_at: N },
  venue_staff: { user_id: P, venue_id: N },
  venues: {
    id: N, name: P, created_at: N, layout_lock_password_hash: S, terms_version: N, terms_accepted_at: N,
    address: P, phone: P, logo_path: N,
  },
};
