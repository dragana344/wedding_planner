import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { withRequestLog } from "@/lib/api/handler";

// Uptime probe (REL-001): no auth, no personal data, never cached. 200 when a
// trivial service-role query succeeds, 503 otherwise. `release` is the
// deployed git SHA (set by the deploy workflow, else Vercel's git metadata)
// so monitoring and error reports can name the build.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  return withRequestLog(request, health);
}

async function health() {
  const release = process.env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
  try {
    const { error } = await createServiceRoleClient()
      .from("venues")
      .select("id", { head: true, count: "exact" })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw error;
    return NextResponse.json({ ok: true, release }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, release }, { status: 503, headers: NO_STORE });
  }
}
