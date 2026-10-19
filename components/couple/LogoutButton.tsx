"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/couple/logout", { method: "POST" });
    // A hard navigation, not router.push: same reasoning as the other
    // sign-outs — a client-side transition right after the session cookie
    // is cleared can race ahead of it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/couple/login";
  }
  return (
    <button type="button" onClick={handleLogout} className="btn btn-ghost">
      Одјави се
    </button>
  );
}
