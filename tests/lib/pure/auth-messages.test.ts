import { describe, it, expect } from "vitest";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";

describe("authErrorMessage (A18)", () => {
  it("turns Supabase Auth errors into Macedonian by code", () => {
    expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("Неточен email или лозинка.");
    expect(authErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" })).toBe(
      "Прво потврдете го email-от преку линкот што ви го испративме, па најавете се.",
    );
    expect(authErrorMessage({ code: "user_already_exists", message: "User already registered" })).toBe("Веќе постои сметка со овој email. Најавете се.");
    expect(authErrorMessage({ code: "weak_password", message: "Password should be at least 6 characters." })).toBe(
      "Лозинката е преслаба. Користете подолга лозинка со букви и бројки.",
    );
    expect(authErrorMessage({ code: "same_password", message: "x" })).toBe("Новата лозинка мора да е различна од старата.");
    expect(authErrorMessage({ code: "over_request_rate_limit", message: "x" })).toBe("Премногу обиди. Обидете се повторно за неколку минути.");
    expect(authErrorMessage({ code: "session_not_found", message: "x" })).toBe("Линкот истекол. Побарајте нов линк за промена на лозинка.");
  });

  it("falls back on the message for older errors without a code", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" })).toBe("Неточен email или лозинка.");
    expect(authErrorMessage({ message: "User already registered" })).toBe("Веќе постои сметка со овој email. Најавете се.");
    expect(authErrorMessage({ message: "Email rate limit exceeded" })).toBe("Премногу обиди. Обидете се повторно за неколку минути.");
  });

  it("never shows an unknown English message", () => {
    expect(authErrorMessage({ message: "Database error saving new user" })).toBe(GENERIC_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_ERROR);
  });
});
