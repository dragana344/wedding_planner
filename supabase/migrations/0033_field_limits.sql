-- 0033 (DATA-009): database-level limits on everything couples and the public
-- can write, so a bug or a bypass of the API validation (SEC-004) still cannot
-- store megabytes or empty names. Caps sit well above real use and above the
-- API limits (names 200, long text 5000). Adding a CHECK validates existing
-- rows, so this migration fails loudly rather than leaving bad data in place.

-- Short text: names, titles, labels.
alter table public.event_guests            add constraint event_guests_full_name_len        check (char_length(btrim(full_name)) between 1 and 300);
alter table public.event_agenda_items      add constraint event_agenda_items_title_len       check (char_length(btrim(title)) between 1 and 300);
alter table public.event_budget_items      add constraint event_budget_items_name_len        check (char_length(btrim(name)) between 1 and 300);
alter table public.event_budget_items      add constraint event_budget_items_custom_label_len check (custom_label is null or char_length(custom_label) <= 300);
alter table public.event_checklist_items   add constraint event_checklist_items_title_len    check (char_length(btrim(title)) between 1 and 300);
alter table public.event_checklist_subtasks add constraint event_checklist_subtasks_title_len check (char_length(btrim(title)) between 1 and 300);
alter table public.event_locations         add constraint event_locations_label_len          check (char_length(btrim(label)) between 1 and 300);
alter table public.event_notes             add constraint event_notes_title_len              check (title is null or char_length(title) <= 300);
alter table public.event_layout_elements   add constraint event_layout_elements_label_len    check (label is null or char_length(label) <= 300);
alter table public.events                  add constraint events_couple_names_len            check (char_length(btrim(couple_names)) between 1 and 300);
alter table public.reservations            add constraint reservations_guest_name_len        check (char_length(btrim(guest_name)) between 1 and 300);
alter table public.contact_submissions     add constraint contact_submissions_name_len       check (char_length(btrim(name)) between 1 and 300);

-- Contact details.
alter table public.event_guests        add constraint event_guests_phone_len          check (phone is null or char_length(phone) <= 50);
alter table public.events              add constraint events_contact_phone_len        check (contact_phone is null or char_length(contact_phone) <= 50);
alter table public.events              add constraint events_contact_email_len        check (contact_email is null or char_length(contact_email) <= 320);
alter table public.events              add constraint events_contact_email_2_len      check (contact_email_2 is null or char_length(contact_email_2) <= 320);
alter table public.reservations        add constraint reservations_phone_len          check (phone is null or char_length(phone) <= 50);
alter table public.reservations        add constraint reservations_email_len          check (email is null or char_length(email) <= 320);
alter table public.contact_submissions add constraint contact_submissions_email_len   check (char_length(btrim(email)) between 3 and 320);
alter table public.event_locations     add constraint event_locations_address_len     check (address is null or char_length(address) <= 1000);
alter table public.event_locations     add constraint event_locations_map_url_len     check (map_url is null or char_length(map_url) <= 2048);

-- Long text.
alter table public.event_guests        add constraint event_guests_notes_len          check (notes is null or char_length(notes) <= 10000);
alter table public.event_agenda_items  add constraint event_agenda_items_notes_len    check (notes is null or char_length(notes) <= 10000);
alter table public.event_notes         add constraint event_notes_content_len         check (char_length(content) <= 20000);
alter table public.event_invitations   add constraint event_invitations_message_len   check (message is null or char_length(message) <= 10000);
alter table public.reservations        add constraint reservations_note_len           check (note is null or char_length(note) <= 10000);
alter table public.contact_submissions add constraint contact_submissions_message_len check (char_length(btrim(message)) between 1 and 10000);

-- Numbers.
alter table public.event_guests               add constraint event_guests_party_size_max            check (party_size <= 100);
alter table public.reservations               add constraint reservations_party_size_max            check (party_size <= 10000);
alter table public.events                     add constraint events_guest_count_estimate_range      check (guest_count_estimate is null or guest_count_estimate between 0 and 10000);
alter table public.event_menu_item_quantities add constraint event_menu_item_quantities_guest_max   check (guest_count is null or guest_count <= 10000);
alter table public.event_budget_items         add constraint event_budget_items_estimated_max       check (estimated_amount is null or estimated_amount < 1e12);
alter table public.event_budget_items         add constraint event_budget_items_paid_max            check (paid_amount < 1e12);

-- Seating JSON written from the couple's editor.
alter table public.events add constraint events_seating_draft_size      check (seating_draft is null or octet_length(seating_draft::text) <= 2000000);
alter table public.events add constraint events_seating_draft_undo_size check (seating_draft_undo is null or octet_length(seating_draft_undo::text) <= 2000000);
