// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { submitContactMessage } from "@/lib/venue/contact";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/venue/contact: submitContactMessage", () => {
  it("stores a contact submission", async () => {
    await submitContactMessage({
      name: "Ана Петровска",
      email: "ana@example.com",
      message: "Ве молиме контактирајте ме за повеќе информации.",
    });

    const { data } = await admin
      .from("contact_submissions")
      .select("*")
      .eq("email", "ana@example.com")
      .single();

    expect(data).not.toBeNull();
    expect(data!.name).toBe("Ана Петровска");
    expect(data!.message).toBe("Ве молиме контактирајте ме за повеќе информации.");

    await admin.from("contact_submissions").delete().eq("email", "ana@example.com");
  });
});
