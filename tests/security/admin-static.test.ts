// @vitest-environment node
//
// Grep-based boundary scan (spec D2): every check below reads each admin
// source file as plain text and looks for literal substrings/word matches.
// It has no understanding of imports, re-exports, or indirection — a
// reference built dynamically or hidden behind a variable (e.g.
// `.from(tableVar)` where `tableVar` holds "reservations", or a table name
// assembled from a template literal) will not be caught. Treat this as a
// fast net that fails loud on direct references, not a complete guarantee;
// a real security review still needs to read the code.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const adminFiles = [...files("app/admin"), ...files("lib/admin"), ...files("components/admin")];

const PRIVATE_TABLES = [
  // Tables owned by sessions 2–4 (MASTER §7) are private too.
  "event_seat_assignments", "event_photos", "event_greetings", "event_co_organizers", "event_reminders",
  "event_guests", "event_notes", "event_budget_items", "event_checklist_items", "event_checklist_subtasks",
  "event_agenda_items", "event_locations", "event_invitations", "event_custom_menu_items",
  "event_menu_item_quantities", "couple_sessions", "event_credentials",
  // contact_submissions is deliberately NOT listed here: it is the
  // platform's own data (the marketing site's contact form), not a venue's
  // or a couple's, so admin code may read its name/email/message (spec §5
  // item 5, task 4.1) — see lib/admin/queries.ts's listMessages.
];
const PRIVATE_COLUMNS = ["guest_name", "contact_email", "contact_email_2", "contact_phone"];

describe("admin code boundaries", () => {
  it("never reads guest or couple planning data (spec D2)", () => {
    for (const f of adminFiles) {
      const src = readFileSync(f, "utf8");
      for (const t of [...PRIVATE_TABLES, ...PRIVATE_COLUMNS]) {
        expect(src.includes(`"${t}"`) || src.includes(`'${t}'`) || new RegExp(`\\b${t}\\b`).test(src.replace(/\/\/.*$/gm, "")), `${f} references ${t}`).toBe(false);
      }
    }
  });

  // reservations.guest_name/phone/email/note are private too (constraints.md),
  // but "phone"/"email"/"note" are too generic to add to PRIVATE_COLUMNS as
  // bare words without false positives (e.g. an admin contact form's own
  // `email` state variable). Admin has no legitimate reason to query the
  // reservations table at all, so ban the table reference itself instead of
  // trying to list its private columns individually.
  it("never queries the reservations table", () => {
    for (const f of adminFiles) {
      const src = readFileSync(f, "utf8");
      expect(src.includes('from("reservations")') || src.includes("from('reservations')"), `${f} references reservations`).toBe(false);
    }
  });

  it("guards every Server Action module with adminAction", () => {
    // lib/admin/actions.ts is the framework module that *defines* adminAction
    // itself (task 1.3) — it is not a page's Server Action module and can't
    // wrap its own factory. The per-domain modules this guards (e.g. a future
    // app/admin/venues/actions.ts) live elsewhere and still get scanned.
    for (const f of adminFiles.filter((f) => f.endsWith("actions.ts") && f !== path.join("lib", "admin", "actions.ts"))) {
      const src = readFileSync(f, "utf8");
      expect(src.startsWith('"use server";'), `${f} must start with "use server"`).toBe(true);
      const exported = src.match(/export const \w+ = /g) ?? [];
      const wrapped = src.match(/export const \w+ = adminAction\(/g) ?? [];
      expect(wrapped.length, `${f}: every exported action uses adminAction`).toBe(exported.length);
      expect(/export (async )?function/.test(src), `${f}: no unwrapped exported functions`).toBe(false);
    }
  });

  it("guards every admin page layout", () => {
    const layout = readFileSync("app/admin/(panel)/layout.tsx", "utf8");
    expect(layout).toContain("requireAdmin({ page: true })");
  });

  // Next can render a page segment without re-running its layout (an RSC
  // request whose router-state header already holds the layout), so the
  // layout alone is not a gate: every page checks too.
  it("guards every admin page itself", () => {
    const pages = files("app/admin/(panel)").filter((f) => path.basename(f) === "page.tsx");
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const f of pages) {
      const src = readFileSync(f, "utf8");
      const body = src.slice(src.indexOf("export default async function"));
      const firstStatement = body.slice(body.indexOf("{", body.indexOf(")")) + 1).trim();
      expect(src, `${f} must call requireAdmin({ page: true })`).toContain("requireAdmin({ page: true })");
      expect(firstStatement.startsWith("await requireAdmin({ page: true });"), `${f}: requireAdmin must be the first statement`).toBe(true);
    }
  });

  it("guards every exported admin read query", () => {
    const src = readFileSync("lib/admin/queries.ts", "utf8");
    const chunks = src.split(/^export async function /m).slice(1);
    expect(chunks.length).toBeGreaterThanOrEqual(10);
    for (const chunk of chunks) {
      const name = chunk.match(/^\w+/)![0];
      // The signature ends on the first line ending in "{" once the
      // parameter list's parentheses have closed; the body starts after it.
      const lines = chunk.split("\n");
      let depth = 0;
      const sigEnd = lines.findIndex((l) => {
        depth += (l.match(/\(/g) ?? []).length - (l.match(/\)/g) ?? []).length;
        return depth === 0 && /\{\s*$/.test(l);
      });
      const first = lines.slice(sigEnd + 1).find((l) => l.trim() !== "")?.trim();
      expect(first, `lib/admin/queries.ts ${name} must start with await requireAdmin()`).toBe("await requireAdmin();");
    }
  });

  // app/venue/panel.css has `.vp .grid { min-width: 1010px }` (the venue
  // calendar grid); a Tailwind `grid` class inside the panel shells picks it
  // up and scrolls sideways on phones. Session-1 UI uses inline grid styles.
  it("never uses the panel-colliding `grid` class name in admin/package UI", () => {
    const uiFiles = [...adminFiles, ...files("app/couple/(protected)/packages"), ...files("components/entitlements")];
    for (const f of uiFiles) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        expect((m[1] ?? m[2]).split(/\s+/), `${f} uses the "grid" class`).not.toContain("grid");
      }
    }
  });
});
