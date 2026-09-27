"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/couple/logout", { method: "POST" });
    router.push("/couple/login");
  }
  return (
    <button type="button" onClick={handleLogout} className="btn btn-ghost">
      Одјави се
    </button>
  );
}
