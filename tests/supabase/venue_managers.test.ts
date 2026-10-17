import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueA: string;
let venueB: string;

beforeAll(async () => {
  venueA = (await admin.from("venues").insert({ name: `Managers Venue A ${stamp}` }).select("id").single()).data!.id;
  venueB = (await admin.from("venues").insert({ name: `Managers Venue B ${stamp}` }).select("id").single()).data!.id;
});
afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueA, venueB]);
});

describe("venue_managers / verify_venue_manager", () => {
  it("creates a manager and verifies the correct password", async () => {
    const { data: managerId, error } = await admin.rpc("create_venue_manager", {
      p_venue_id: venueA, p_name: "Марко", p_password: "sister-moon-42", p_is_owner: true,
    });
    expect(error).toBeNull();
    expect(managerId).toBeTruthy();

    const { data } = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Марко", p_password: "sister-moon-42" });
    expect(data![0]).toMatchObject({ manager_id: managerId, manager_name: "Марко", is_owner: true, error_code: null });
  });

  it("refuses a wrong password without revealing whether the name exists", async () => {
    const wrongPassword = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Марко", p_password: "nope" });
    expect(wrongPassword.data![0].error_code).toBe("invalid");
    const unknownName = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Nobody", p_password: "nope" });
    expect(unknownName.data![0].error_code).toBe("invalid");
  });

  it("locks out after 5 failed attempts, then refuses even the right password", async () => {
    await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Ана", p_password: "correct-horse-1", p_is_owner: false });
    for (let i = 0; i < 5; i++) {
      await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Ана", p_password: "wrong" });
    }
    const { data } = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Ана", p_password: "correct-horse-1" });
    expect(data![0].error_code).toBe("locked");
  });

  it("locks out under a concurrent burst — no race lets more than 5 real password checks through", async () => {
    // Without a row lock on the initial read, every one of these concurrent
    // calls can read locked_until = null before any sibling's UPDATE
    // commits, letting all of them run a real bcrypt check ("invalid")
    // instead of some correctly seeing the account already locked.
    await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Гласно", p_password: "correct-concurrency-1", p_is_owner: false });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Гласно", p_password: "wrong" }))
    );
    const invalidCount = results.filter((r) => r.data![0].error_code === "invalid").length;
    expect(invalidCount).toBeLessThanOrEqual(5);

    const { data: finalCheck } = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Гласно", p_password: "correct-concurrency-1" });
    expect(finalCheck![0].error_code).toBe("locked");
  });

  it("starts a fresh attempt window once an expired lock passes, instead of re-locking on the very next wrong password forever (final review finding)", async () => {
    // is_owner: false — venueA already has an owner from an earlier test in
    // this file, and only one is allowed per venue; the lockout logic this
    // test exercises doesn't depend on is_owner either way.
    const { data: managerId } = await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Петре", p_password: "owner-recovery-1", p_is_owner: false });
    for (let i = 0; i < 5; i++) {
      await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Петре", p_password: "wrong" });
    }
    const whileLocked = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Петре", p_password: "owner-recovery-1" });
    expect(whileLocked.data![0].error_code).toBe("locked");

    // Simulates the 15-minute lock having already expired.
    await admin.from("venue_managers").update({ locked_until: new Date(Date.now() - 1000).toISOString() }).eq("id", managerId);

    // A single wrong password right after the lock expires must NOT
    // immediately re-lock the account — that was the bug: failed_attempts
    // never reset, so this one wrong try alone crossed the >=5 threshold
    // again and locked it for another 15 minutes, forever, with no way
    // back in except support.
    const freshWrong = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Петре", p_password: "wrong" });
    expect(freshWrong.data![0].error_code).toBe("invalid");

    // The right password still works right after — the account isn't locked.
    const freshRight = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Петре", p_password: "owner-recovery-1" });
    expect(freshRight.data![0].error_code).toBeNull();
  });

  it("scopes manager names to their own venue — same name at a different venue is a different manager", async () => {
    await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Петар", p_password: "venue-a-pass-1", p_is_owner: false });
    await admin.rpc("create_venue_manager", { p_venue_id: venueB, p_name: "Петар", p_password: "venue-b-pass-1", p_is_owner: false });

    const crossCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueB, p_name: "Петар", p_password: "venue-a-pass-1" });
    expect(crossCheck.data![0].error_code).toBe("invalid");
    const ownCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueB, p_name: "Петар", p_password: "venue-b-pass-1" });
    expect(ownCheck.data![0].error_code).toBeNull();
  });

  it("trims whitespace on login the same way create_venue_manager trims it on storage (security review minor finding)", async () => {
    await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Трим Менаџер", p_password: "trim-case-pass-1", p_is_owner: false });
    const padded = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "  Трим Менаџер  ", p_password: "trim-case-pass-1" });
    expect(padded.data![0].error_code).toBeNull();
    expect(padded.data![0].manager_name).toBe("Трим Менаџер");
  });

  it("allows only one owner per venue", async () => {
    const { error } = await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Втор Сопственик", p_password: "second-owner-1", p_is_owner: true });
    // RPC calls return { data: null, error } on failure, they don't throw.
    // A unique-index violation's Postgres message includes the index name.
    expect(error).not.toBeNull();
    expect(error!.message).toContain("venue_managers_one_owner");
  });
});
