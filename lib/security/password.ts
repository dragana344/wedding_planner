// One minimum password length for every password in the app: the venue's
// sign-in, managers and the owner, couples and co-organizers. Safe to import
// from client components. The database checks the same number
// (0034/0045/0061/0133 for couples, 0176 for managers), Supabase Auth has it
// as minimum_password_length (supabase/config.toml), and the legal texts
// quote it through SECURITY_FACTS.minPasswordLength; legal-parity.test.ts
// keeps them in step.

export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_LENGTH_ERROR = `Лозинката мора да има најмалку ${MIN_PASSWORD_LENGTH} знаци.`;

/** The hint under a new-password field. */
export const PASSWORD_LENGTH_HINT = `Најмалку ${MIN_PASSWORD_LENGTH} знаци.`;
