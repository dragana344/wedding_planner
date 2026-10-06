import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEventCredentials, USERNAME_TAKEN } from "@/lib/venue/credentials";

const clientAnswering = (error: { code: string; message: string } | null) =>
  ({ rpc: async () => ({ data: null, error }) }) as unknown as SupabaseClient;

describe("createEventCredentials errors", () => {
  it("says the username is taken on a unique violation", async () => {
    const client = clientAnswering({ code: "23505", message: 'duplicate key value violates unique constraint "event_credentials_username_key"' });
    await expect(createEventCredentials("e1", "filip", "long-enough-password", client)).rejects.toThrow(USERNAME_TAKEN);
  });

  it("passes on the database's own Macedonian message for a short password", async () => {
    const client = clientAnswering({ code: "22023", message: "Лозинката мора да има најмалку 10 знаци." });
    await expect(createEventCredentials("e1", "filip", "short", client)).rejects.toThrow("Лозинката мора да има најмалку 10 знаци.");
  });

  it("resolves when the database accepts the login", async () => {
    await expect(createEventCredentials("e1", "filip", "long-enough-password", clientAnswering(null))).resolves.toBeUndefined();
  });
});
