-- 0157: a room (hall) can carry its own address and map link, entered when the
-- venue creates or edits the room. The couple's agenda uses it for "in the
-- restaurant" (falling back to the venue's address, venues.address, when a
-- room has none). Rooms are written straight from the browser under RLS, so
-- the map link's scheme is checked here too: only http(s) links, never
-- javascript: or data: (SEC-025 SR-11).

alter table public.rooms add column address text;
alter table public.rooms add column map_url text;
alter table public.rooms add constraint rooms_address_len check (address is null or char_length(address) <= 1000);
alter table public.rooms add constraint rooms_map_url_len check (map_url is null or char_length(map_url) <= 2048);
alter table public.rooms add constraint rooms_map_url_scheme check (map_url is null or map_url ~* '^https?://');
