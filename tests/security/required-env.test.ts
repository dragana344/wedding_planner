// @vitest-environment node
import { describe, it, expect } from "vitest";
import { assertRequiredEnv } from "@/lib/required-env.mjs";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_y",
};

describe("required env validation at build/boot (REL-002)", () => {
  it("accepts a complete configuration", () => {
    expect(() => assertRequiredEnv(valid)).not.toThrow();
  });

  it("names every missing variable", () => {
    expect(() => assertRequiredEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "" })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => assertRequiredEnv({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("rejects a malformed URL", () => {
    expect(() => assertRequiredEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(/not a valid URL/);
  });

  it("refuses a local or plain-http Supabase URL on Vercel", () => {
    expect(() => assertRequiredEnv({ ...valid, VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toThrow(/https/);
    expect(() => assertRequiredEnv({ ...valid, VERCEL_ENV: "preview" })).not.toThrow();
  });

  it("refuses the service key in the public slot", () => {
    expect(() => assertRequiredEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: "same", SUPABASE_SERVICE_ROLE_KEY: "same" })).toThrow(/identical/);
  });
});
