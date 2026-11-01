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
  contact_submissions: { id: N, name: P, email: P, message: P, created_at: C, status: N, handled_at: N },
  couple_sessions: { token: S, event_id: N, created_at: N, expires_at: N, organizer_id: N },
  event_albums: { event_id: N, public_token: S, retention_notice_sent_at: N, created_at: N },
  event_agenda_items: { id: N, event_id: N, time: C, title: P, notes: P, sort_order: N, created_at: N },
  event_budget_items: { id: N, event_id: N, category: C, custom_label: P, name: P, estimated_amount: C, paid_amount: C, created_at: N },
  event_checklist_items: { id: N, event_id: N, title: P, due_date: C, is_done: N, created_at: N },
  event_checklist_subtasks: { id: N, checklist_item_id: N, title: P, is_done: N, created_at: N },
  // 0125. old/new values are context (kept on erasure: the log is the event's
  // history), except the contact section's, which erasure nulls explicitly.
  // changed_by / seen_by / reminded_by name a manager or organizer.
  event_changes: {
    id: N, event_id: N, section: N, side: N, changed_by: P, field: N, old_value: C, new_value: C, changed_at: N,
  },
  event_change_seen: { event_id: N, viewer: N, section: N, seen_up_to: N, seen_by: P },
  event_couple_reminders: { id: N, event_id: N, reminded_at: N, reminded_by: P },
  event_co_organizers: {
    id: N, event_id: N, side: P, username: P, password_hash: S, failed_attempts: N, locked_until: N, created_at: N,
  },
  event_reminders: { event_id: N, send_at: C, status: N, sent_at: C, sent_count: N, updated_at: N },
  event_credentials: { event_id: N, username: P, password_hash: S, failed_attempts: N, locked_until: N, created_at: N },
  event_feature_overrides: {
    event_id: N, feature_key: N, enabled: N, limit_override: N, limit_value: N, note: C, updated_at: N, updated_by: N,
  },
  event_guests: {
    id: N, event_id: N, full_name: P, phone: P, party_size: C, rsvp_status: C, notes: P, created_at: N, side: P,
    rsvp_changed_via_link_at: C, rsvp_previous_status: C, invite_token: S, email: P, allergies: P,
    children_count: C, rsvp_comment: P, invitation_sent_at: C, invitation_channel: C, reminder_sent_at: C,
  },
  event_greetings: {
    id: N, event_id: N, first_name: P, last_name: P, message: P, video_path: P, video_bytes: N, hidden_at: N, created_at: N,
  },
  event_invitations: { event_id: N, template_id: N, message: P, photo_path: P, public_slug: S, created_at: N },
  event_layout_elements: {
    id: N, event_id: N, room_id: N, element_type: N, table_type_id: N, x_cm: N, y_cm: N, width_cm: N, length_cm: N,
    rotation_deg: N, label: P, created_at: N, group_id: N, table_role: N,
  },
  event_locations: { id: N, event_id: N, label: P, address: P, map_url: P, sort_order: N, created_at: N },
  event_guest_menu_counts: { guest_id: N, menu_template_id: N, count: P },
  // sent_by is always the fixed "Младенците"; seen_by is the venue manager's name.
  event_menu_submissions: {
    id: N, event_id: N, sent_at: N, sent_by: N, counts: C, menu_titles: N, total: C, seen_at: N, seen_by: P,
    source: N, unanswered: C,
  },
  event_menu_templates: { event_id: N, menu_template_id: N },
  event_notes: { id: N, event_id: N, title: P, content: P, created_at: N, updated_at: N },
  event_rooms: { event_id: N, room_id: N, layout_initialized_at: N },
  event_photos: {
    id: N, event_id: N, storage_path: P, bytes: N, mime: N, width: N, height: N, uploader_name: P, consent_at: N, hidden_at: N,
    created_at: N,
  },
  event_seat_assignments: {
    id: N, event_id: N, room_id: N, layout_element_id: N, seat_number: N, guest_id: N, guest_name: P, updated_at: N,
  },
  event_showcase_photos: { id: N, event_id: N, photo_path: P, created_at: N },
  events: {
    id: N, venue_id: N, couple_names: P, event_date: C, guest_count_estimate: C, created_at: N,
    layout_undo_snapshot: P, contact_email: P, contact_email_2: P, contact_phone: P, start_time: C, end_time: C,
    status: C, event_type: C, seating_draft: P, seating_draft_undo: P, seating_confirmed_at: N, total_price: C,
    deposit_paid: C, checklist_seeded_at: N, personal_data_erased_at: N, seating_history: P, layout_history: P, seating_rev: N,
    seating_unseen_at: N,
    // System flag (0125): whether the couple has ever logged in.
    couple_first_login_at: N,
  },
  menu_items: {
    id: N, course: N, name: N, allergen_tags: N, is_vegetarian: N, is_vegan: N, created_at: N, price: N, photo_path: N,
    venue_id: N, tiers: N,
  },
  menu_template_items: { menu_template_id: N, menu_item_id: N },
  menu_templates: { id: N, venue_id: N, name: N, description: N, created_at: N, event_id: N },
  plan_features: { plan_id: N, feature_key: N, enabled: N, limit_value: N },
  plans: { id: N, name: N, description: N, sort_order: N, is_default: N, is_public: N, created_at: N },
  platform_settings: { id: N, maintenance_mode: N, updated_at: N, updated_by: N },
  pricing_cards: { id: N, name: N, price: N, period: N, features: N, is_featured: N, is_published: N, sort_order: N, created_at: N, updated_at: N },
  rate_limits: { key: N, window_start: N, hits: N },
  reservation_tables: { reservation_id: N, layout_element_id: N, span: N, active: N },
  reservations: {
    id: N, venue_id: N, room_id: N, guest_name: P, phone: P, email: P, date: C, start_time: C, end_time: C,
    party_size: C, status: C, event_type: C, note: P, created_at: N,
    // The venue staff member (waiter/barista) who took the booking, not the
    // dining guest — outside the scope of this guest's export/erasure.
    server_name: N,
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
  support_tickets: {
    id: N, venue_id: N, event_id: N, submitted_by: N, name: P, problem: P, description: P, status: N,
    admin_comment: C, resolved_at: N, created_at: N,
  },
  table_types: { id: N, room_id: N, name: N, shape: N, seats: N, width_cm: N, length_cm: N, quantity: N, created_at: N },
  venue_feature_overrides: {
    venue_id: N, feature_key: N, enabled: N, limit_override: N, limit_value: N, note: C, updated_at: N, updated_by: N,
  },
  venue_managers: {
    id: N, venue_id: N, name: P, password_hash: S, is_owner: N, failed_attempts: N, locked_until: N, created_at: N,
    // System-set flag timestamp (support reset the password) — no personal content.
    password_reset_notice_at: N,
  },
  venue_manager_elevations: { token: S, venue_id: N, manager_id: N, manager_name: P, created_at: N, expires_at: N },
  venue_staff: { user_id: P, venue_id: N },
  venues: {
    id: N, name: P, created_at: N, layout_lock_password_hash: S, terms_version: N, terms_accepted_at: N,
    address: P, phone: P, logo_path: N, brand_color: N,
    plan_id: N, blocked_at: N, blocked_reason: C,
  },
};
