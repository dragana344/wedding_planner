import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { finishPendingSignup } from "@/lib/venue/pending-signup";

// The venue of an owner who had to confirm their email is opened on the first
// sign-in, from the name /signup left in the user's metadata.

function clientWithStaffRow(staffRow: { venue_id: string } | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: staffRow, error });
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
  return { client: { from } as unknown as SupabaseClient, from };
}

const owner = { id: "u-1", user_metadata: { venue_name: "Демо Локал" } } as unknown as User;

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("finishPendingSignup", () => {
  it("opens the venue for a confirmed owner who has none yet", async () => {
    const { client } = clientWithStaffRow(null);
    await expect(finishPendingSignup(client, owner)).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/venue/signup",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ venue_name: "Демо Локал" }) })
    );
  });

  it("does nothing for staff who already have a venue", async () => {
    const { client } = clientWithStaffRow({ venue_id: "v-1" });
    await expect(finishPendingSignup(client, owner)).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does nothing, and asks the database nothing, for a user without a pending venue name", async () => {
    const { client, from } = clientWithStaffRow(null);
    const invited = { id: "u-2", user_metadata: {} } as unknown as User;
    await expect(finishPendingSignup(client, invited)).resolves.toBe(false);
    await expect(finishPendingSignup(client, null)).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not provision when the staff lookup itself fails", async () => {
    const { client } = clientWithStaffRow(null, { message: "boom" });
    await expect(finishPendingSignup(client, owner)).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports failure when the provisioning route refuses", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const { client } = clientWithStaffRow(null);
    await expect(finishPendingSignup(client, owner)).resolves.toBe(false);
  });
});
