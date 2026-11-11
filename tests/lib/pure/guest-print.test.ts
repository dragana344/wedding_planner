import { describe, it, expect } from "vitest";
import { buildPrintGuestGroups } from "@/lib/couple/guest-print";
import type { Guest } from "@/lib/couple/guests";

const base: Guest = {
  id: "g1",
  event_id: "e1",
  full_name: "Ана Петровска",
  phone: "070 111 222",
  party_size: 3,
  rsvp_status: "confirmed",
  notes: null,
  side: "bride",
  invite_token: "secret-token-not-exported-xx",
  email: "ana@example.mk",
  children_count: 1,
  menu_counts: { "m-classic": 2, "m-posno": 1 },
  allergies: "ореви",
  rsvp_comment: null,
  invitation_sent_at: null,
  invitation_channel: null,
};

const menus = [
  { id: "m-classic", name: "Класично" },
  { id: "m-posno", name: "Посно" },
];

describe("buildPrintGuestGroups", () => {
  it("groups a wedding's guests by side and totals each group's people", () => {
    const groom: Guest = { ...base, id: "g2", full_name: "Марко Марковски", side: "groom", party_size: 2, menu_counts: {} };
    const [bride, groomGroup] = buildPrintGuestGroups([base, groom], menus, true);
    expect(bride.label).toBe("Страна на невестата");
    expect(bride.rows.map((r) => r.fullName)).toEqual(["Ана Петровска"]);
    expect(bride.totalPeople).toBe(3);
    expect(groomGroup.label).toBe("Страна на младоженецот");
    expect(groomGroup.totalPeople).toBe(2);
  });

  it("adds an 'Недоделени' group only when someone has no side", () => {
    expect(buildPrintGuestGroups([base], menus, true)).toHaveLength(2);
    const unassigned: Guest = { ...base, id: "g3", side: null };
    const groups = buildPrintGuestGroups([base, unassigned], menus, true);
    expect(groups).toHaveLength(3);
    expect(groups[2].label).toBe("Недоделени");
    expect(groups[2].rows).toHaveLength(1);
  });

  it("is one ungrouped list for a non-wedding event", () => {
    const groups = buildPrintGuestGroups([base], menus, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
    expect(groups[0].rows).toHaveLength(1);
  });

  it("summarises a done guest's menu split, and flags an unfinished one", () => {
    const [group] = buildPrintGuestGroups([base], menus, false);
    expect(group.rows[0].menu).toBe("Класично 2, Посно 1");
    const unfinished: Guest = { ...base, menu_counts: {} };
    expect(buildPrintGuestGroups([unfinished], menus, false)[0].rows[0].menu).toBe("Нема избрано мени");
  });

  it("shows just the one menu's name for a single-menu event, and nothing for a non-confirmed guest", () => {
    const single = buildPrintGuestGroups([base], [menus[0]], false)[0].rows[0];
    expect(single.menu).toBe("Класично");
    const declined: Guest = { ...base, rsvp_status: "declined" };
    expect(buildPrintGuestGroups([declined], menus, false)[0].rows[0].menu).toBe("");
  });

  it("carries phone, children count, status label and allergies through to the row", () => {
    const row = buildPrintGuestGroups([base], [], false)[0].rows[0];
    expect(row.phone).toBe("070 111 222");
    expect(row.childrenCount).toBe(1);
    expect(row.status).toBe("Потврден");
    expect(row.allergies).toBe("ореви");
  });
});
