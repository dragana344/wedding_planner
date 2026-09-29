// Couple session tokens are stored hashed (SEC-008): a read of
// couple_sessions (backup, SQL console, leaked service key) yields no usable
// login. Web Crypto, not node:crypto, because middleware runs on the Edge
// runtime.

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
