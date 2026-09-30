#!/usr/bin/env node
// Demo hall for Leona Lux (B8), after productioncheck/wedding-shit/"visual image 4.png":
// 40 round guest tables × 10 seats numbered as on the sketch, the couple's
// table, 5 pillars, entrance, music, photo stage and a dance floor.
//
// Local/demo only. Never run automatically, never against production data.
//
//   node scripts/seed-leona-lux-layout.mjs                       # local DB (.env.test.local), venue "Leona Lux (демо)"
//   node scripts/seed-leona-lux-layout.mjs --venue-name "X"      # local DB, venue named X
//   node scripts/seed-leona-lux-layout.mjs --allow-remote --venue-id <uuid>
//                                                                # a remote DB (e.g. the Cloud demo account), one
//                                                                # existing venue — the owner runs this by hand
//
// Idempotent: re-running replaces only the elements of that venue's
// "Голема сала".

import { existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const allowRemote = process.argv.includes("--allow-remote");
const venueIdArg = arg("--venue-id");
const venueName = arg("--venue-name") ?? "Leona Lux (демо)";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(".env.test.local")) process.loadEnvFile(".env.test.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!url || !key) fail("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run `node scripts/write-test-env.mjs` for local).");
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
if (!local && !allowRemote) fail(`Refusing to seed ${new URL(url).host}: not a local database. Pass --allow-remote --venue-id <uuid> to seed one existing venue on purpose.`);
if (!local && !venueIdArg) fail("--allow-remote needs --venue-id <uuid>: a remote seed only ever touches one existing venue.");

const db = createClient(url, key, { auth: { persistSession: false } });

async function must(query, what) {
  const { data, error } = await query;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

// Sketch: 1015 × 598 px inside the hall outline ≈ 3600 × 2120 cm.
const PX = 3.55;
const ORIGIN = { x: 33, y: 48 };
const ROOM = { width_cm: 3600, height_cm: 2130 };
const cm = (px, o) => Math.round((px - o) * PX);

const TABLE = 180; // round, 10 seats
// [sketch number, centre x px, centre y px]; 2, 6 and 9 are not on the sketch
// and fill the free corner bottom-left.
const GUEST_TABLES = [
  [13, 97, 97], [14, 208, 93], [17, 320, 93], [21, 435, 95], [24, 540, 93], [28, 645, 95], [31, 750, 95], [35, 857, 93], [41, 975, 93],
  [12, 95, 173], [16, 207, 168], [20, 322, 165], [23, 430, 168], [27, 540, 168], [30, 640, 173], [34, 750, 172], [38, 857, 175], [40, 975, 176],
  [11, 96, 245], [15, 205, 247], [19, 318, 252], [22, 430, 258], [26, 538, 258], [29, 638, 257], [33, 750, 256], [37, 858, 257], [39, 975, 264],
  [8, 93, 330], [18, 302, 326], [25, 476, 329], [32, 651, 330], [36, 857, 334],
  [5, 94, 409], [4, 200, 407], [7, 92, 480], [10, 200, 482], [3, 791, 606],
  [2, 302, 482], [6, 94, 556], [9, 200, 556],
];
const COUPLE_TABLE = [302, 410];
const PILLARS = [[206, 330], [387, 332], [563, 331], [753, 333], [954, 333]];
const PILLAR = 80;

async function main() {
  // Venue
  let venueId = venueIdArg;
  if (venueId) {
    await must(db.from("venues").select("id").eq("id", venueId).single(), "venue not found");
  } else {
    const found = await must(db.from("venues").select("id").eq("name", venueName).limit(1), "venue lookup");
    venueId = found[0]?.id ?? (await must(db.from("venues").insert({ name: venueName }).select("id").single(), "venue insert")).id;
  }

  // Room
  const rooms = await must(db.from("rooms").select("id").eq("venue_id", venueId).eq("name", "Голема сала").limit(1), "room lookup");
  const roomId =
    rooms[0]?.id ??
    (await must(db.from("rooms").insert({ venue_id: venueId, name: "Голема сала", ...ROOM }).select("id").single(), "room insert")).id;
  await must(db.from("rooms").update(ROOM).eq("id", roomId), "room size");

  // Table types
  async function tableType(name, values) {
    const found = await must(db.from("table_types").select("id").eq("room_id", roomId).eq("name", name).limit(1), "table type lookup");
    if (found[0]) {
      await must(db.from("table_types").update(values).eq("id", found[0].id), "table type update");
      return found[0].id;
    }
    return (await must(db.from("table_types").insert({ room_id: roomId, name, ...values }).select("id").single(), "table type insert")).id;
  }
  const roundId = await tableType("Округла 10", { shape: "round", seats: 10, width_cm: TABLE, length_cm: TABLE, quantity: GUEST_TABLES.length });
  const coupleId = await tableType("Маса за младенци", { shape: "rectangular", seats: 4, width_cm: 240, length_cm: 90, quantity: 1 });

  // Replace the hall's elements (sequential inserts keep created_at order = sketch number order).
  await must(db.from("room_layout_elements").delete().eq("room_id", roomId), "clear layout");
  await must(db.from("room_fixed_elements").delete().eq("room_id", roomId), "clear fixed");

  const tables = [...GUEST_TABLES].sort((a, b) => a[0] - b[0]);
  const layout = [
    {
      element_type: "table", table_type_id: coupleId, table_role: "couple",
      x_cm: cm(COUPLE_TABLE[0], ORIGIN.x) - 120, y_cm: cm(COUPLE_TABLE[1], ORIGIN.y) - 45, width_cm: 240, length_cm: 90, label: null,
    },
    ...tables.map(([n, x, y]) => ({
      element_type: "table", table_type_id: roundId, table_role: "guest",
      x_cm: cm(x, ORIGIN.x) - TABLE / 2, y_cm: cm(y, ORIGIN.y) - TABLE / 2, width_cm: TABLE, length_cm: TABLE, label: `Маса ${n}`,
    })),
    { element_type: "music", x_cm: cm(864, ORIGIN.x), y_cm: cm(472, ORIGIN.y), width_cm: 190, length_cm: 420, label: "Музика" },
    { element_type: "photo_stage", x_cm: cm(378, ORIGIN.x), y_cm: cm(593, ORIGIN.y), width_cm: 925, length_cm: 140, label: "Бина за сликање" },
    { element_type: "dance_floor", x_cm: cm(420, ORIGIN.x), y_cm: cm(385, ORIGIN.y), width_cm: 1150, length_cm: 620, label: "Танц подиум" },
  ];
  for (const el of layout) {
    await must(db.from("room_layout_elements").insert({ room_id: roomId, rotation_deg: 0, ...el }), `layout ${el.label ?? el.element_type}`);
  }

  const fixed = [
    ...PILLARS.map(([x, y]) => ({
      element_type: "pillar", x_cm: cm(x, ORIGIN.x) - PILLAR / 2, y_cm: cm(y, ORIGIN.y) - PILLAR / 2, width_cm: PILLAR, height_cm: PILLAR, label: "Столб",
    })),
    { element_type: "entrance", x_cm: cm(970, ORIGIN.x), y_cm: cm(388, ORIGIN.y), width_cm: 215, height_cm: 370, label: "Влез" },
  ];
  await must(db.from("room_fixed_elements").insert(fixed.map((f) => ({ room_id: roomId, rotation_deg: 0, ...f }))), "fixed elements");

  console.log(`Leona Lux demo hall ready: venue ${venueId}, room ${roomId} (${layout.length} layout + ${fixed.length} fixed elements).`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
