-- Session 2 (guests): personal invite links, richer RSVP answers and
-- invitation-sent tracking on event_guests.
--
-- RLS is unchanged: couples reach this table through the service role and
-- staff through the existing policies.

-- Personal invite link (/invite/<slug>?g=<token>): 18 random bytes as
-- base64url, 24 characters. The default is volatile, so adding the column
-- gives every existing guest its own token.
alter table public.event_guests
  add column invite_token text not null
    default rtrim(translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'), '=')
    constraint event_guests_invite_token_format check (invite_token ~ '^[A-Za-z0-9_-]{22,64}$')
    constraint event_guests_invite_token_key unique;

-- The guest's own answer.
alter table public.event_guests
  add column email text
    constraint event_guests_email_len check (email is null or char_length(email) <= 254),
  add column menu_choice text
    constraint event_guests_menu_choice_check check (menu_choice is null or menu_choice in ('standard', 'posno', 'vegetarian')),
  add column allergies text
    constraint event_guests_allergies_len check (allergies is null or char_length(allergies) <= 300),
  add column children_count integer not null default 0
    constraint event_guests_children_count_range check (children_count between 0 and 100),
  add column rsvp_comment text
    constraint event_guests_rsvp_comment_len check (rsvp_comment is null or char_length(rsvp_comment) <= 500);

-- Whether (and how) the couple has sent this guest the invitation.
alter table public.event_guests
  add column invitation_sent_at timestamptz,
  add column invitation_channel text
    constraint event_guests_invitation_channel_check
    check (invitation_channel is null or invitation_channel in ('whatsapp', 'viber', 'sms', 'email', 'link'));

-- "I'll answer later" (A2), also as the status a link change replaced (SEC-021).
alter table public.event_guests drop constraint event_guests_rsvp_status_check;
alter table public.event_guests add constraint event_guests_rsvp_status_check
  check (rsvp_status in ('invited', 'confirmed', 'declined', 'pending', 'later'));

alter table public.event_guests drop constraint event_guests_rsvp_previous_status_check;
alter table public.event_guests add constraint event_guests_rsvp_previous_status_check
  check (rsvp_previous_status is null or rsvp_previous_status in ('invited', 'confirmed', 'declined', 'pending', 'later'));
