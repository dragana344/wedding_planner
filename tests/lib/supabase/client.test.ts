import { describe, it, expect } from "vitest";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

describe("createBrowserSupabaseClient", () => {
  it("returns a client with a working `from` method", () => {
    const client = createBrowserSupabaseClient();
    expect(typeof client.from).toBe("function");
  });
});
