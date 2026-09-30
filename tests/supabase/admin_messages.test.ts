import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { messageActionCore } from "@/lib/admin/message-actions-core";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: null };

describe("contact message handling", () => {
  it("marks read/answered with a timestamp and deletes", async () => {
    const { data } = await admin.from("contact_submissions").insert({ name: "Nova Sala", email: "msg@test.local", message: "Здраво" }).select("id, status").single();
    expect(data!.status).toBe("new");
    await messageActionCore.setStatus({ id: data!.id, status: "answered" }, ctx);
    const { data: after } = await admin.from("contact_submissions").select("status, handled_at").eq("id", data!.id).single();
    expect(after!.status).toBe("answered");
    expect(after!.handled_at).not.toBeNull();
    await messageActionCore.remove({ id: data!.id }, ctx);
    expect((await admin.from("contact_submissions").select("id").eq("id", data!.id)).data).toEqual([]);
  });
});
