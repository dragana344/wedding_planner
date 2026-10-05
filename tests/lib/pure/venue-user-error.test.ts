import { describe, it, expect } from "vitest";
import { errorMessage } from "@/lib/venue/user-error";

const FALLBACK = "Не успеа зачувувањето. Обидете се повторно.";

describe("errorMessage (venue panel)", () => {
  it("shows a plan limit raised by the database", () => {
    expect(errorMessage({ code: "P0001", message: "Достигнат е лимитот од 1 простории." }, FALLBACK)).toBe("Достигнат е лимитот од 1 простории.");
  });

  it("shows an intentional Error's message", () => {
    expect(errorMessage(new Error("Внесете име на просторијата."), FALLBACK)).toBe("Внесете име на просторијата.");
  });

  it("hides every other database error behind the fallback", () => {
    expect(errorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "rooms_pkey"' }, FALLBACK)).toBe(FALLBACK);
    expect(errorMessage({ code: "P0001", message: "internal_state_error" }, FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});
