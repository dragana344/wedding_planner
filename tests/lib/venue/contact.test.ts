// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { demoRequestText, submitContactMessage, submitDemoRequest } from "@/lib/venue/contact";

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

  it("marks a plain contact message as kind 'contact'", async () => {
    await submitContactMessage({ name: "Б", email: "kind-contact@example.com", message: "Здраво" });
    const { data } = await admin.from("contact_submissions").select("kind").eq("email", "kind-contact@example.com").single();
    expect(data!.kind).toBe("contact");
    await admin.from("contact_submissions").delete().eq("email", "kind-contact@example.com");
  });
});

describe("lib/venue/contact: submitDemoRequest", () => {
  it("stores a demo request with its details in the message, marked kind 'demo'", async () => {
    await submitDemoRequest({
      name: " Марија ",
      venueName: "Ресторан Езеро",
      city: "Охрид",
      phone: "070 123 456",
      email: "demo-req@example.com",
      message: "Имаме две сали.",
    });

    const { data } = await admin.from("contact_submissions").select("*").eq("email", "demo-req@example.com").single();
    expect(data).toMatchObject({
      name: "Марија",
      kind: "demo",
      status: "new",
      message: "Локал: Ресторан Езеро\nГрад: Охрид\nТелефон: 070 123 456\n\nИмаме две сали.",
    });

    await admin.from("contact_submissions").delete().eq("email", "demo-req@example.com");
  });

  it("leaves out the note when the optional message is empty", () => {
    expect(demoRequestText({ name: "А", venueName: "Л", city: "Г", phone: "1", email: "e", message: "  " })).toBe(
      "Локал: Л\nГрад: Г\nТелефон: 1",
    );
  });
});
