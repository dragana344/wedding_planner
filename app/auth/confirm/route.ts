import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Where the links in account emails land when the email templates use
// `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`. Unlike the
// default `?code=` link, this one does not depend on the browser that asked
// for it, so a reset requested on a laptop opens fine on a phone.
const TYPES: readonly EmailOtpType[] = ["recovery", "signup", "email", "invite", "magiclink", "email_change"];

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!tokenHash || !type || !TYPES.includes(type)) return to("/auth/link-expired");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return to("/auth/link-expired");

  return to(type === "recovery" ? "/reset-password" : "/venue");
}
