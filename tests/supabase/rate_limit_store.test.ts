import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { postgresRateLimitStore } from "@/lib/security/rate-limit";

describe("Postgres rate limit store (SEC-002)", () => {
  it("counts concurrent hits atomically within one window", async () => {
    const key = `test:${randomUUID()}`;
    const counts = await Promise.all(Array.from({ length: 25 }, () => postgresRateLimitStore(key, 3600)));
    expect(counts.sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });
});
