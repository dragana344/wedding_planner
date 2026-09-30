// A18: Supabase Auth answers in English; staff screens speak Macedonian.
// Mapped by the error's `code` (auth-js v2), then by its message for older
// errors. Anything unrecognised gets the generic line, never raw English.

export const GENERIC_ERROR = "Нешто тргна наопаку. Обидете се повторно.";

const RATE_LIMITED = "Премногу обиди. Обидете се повторно за неколку минути.";

const BY_CODE: Record<string, string> = {
  invalid_credentials: "Неточен email или лозинка.",
  email_not_confirmed: "Прво потврдете го email-от преку линкот што ви го испративме, па најавете се.",
  user_already_exists: "Веќе постои сметка со овој email. Најавете се.",
  email_exists: "Веќе постои сметка со овој email. Најавете се.",
  weak_password: "Лозинката е преслаба. Користете подолга лозинка со букви и бројки.",
  same_password: "Новата лозинка мора да е различна од старата.",
  over_request_rate_limit: RATE_LIMITED,
  over_email_send_rate_limit: RATE_LIMITED,
  session_not_found: "Линкот истекол. Побарајте нов линк за промена на лозинка.",
  session_expired: "Линкот истекол. Побарајте нов линк за промена на лозинка.",
  email_address_invalid: "Неважечка email адреса.",
  validation_failed: "Проверете ги внесените податоци.",
};

const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/already registered|already exists/i, BY_CODE.user_already_exists],
  [/password should|weak password/i, BY_CODE.weak_password],
  [/rate limit/i, RATE_LIMITED],
  [/should be different from the old password/i, BY_CODE.same_password],
  [/auth session missing|session.*expired/i, BY_CODE.session_not_found],
];

export function authErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  const match = BY_MESSAGE.find(([pattern]) => pattern.test(error.message ?? ""));
  return match ? match[1] : GENERIC_ERROR;
}
