"use client";

import { useRouter } from "next/navigation";
import { MfaSettings } from "@/components/venue/dashboard/MfaSettings";

// Thin client wrapper so the admin's first-time enrolment page (a server
// component) can send the admin straight to /admin once their code is
// confirmed, instead of leaving them on MfaSettings's "on" state — see the
// comment on MfaSettings's onEnabled prop.
export function AdminMfaEnrol() {
  const router = useRouter();
  return <MfaSettings onEnabled={() => router.push("/admin")} />;
}
