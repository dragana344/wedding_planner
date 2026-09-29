import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenue } from "@/lib/venue/current-venue";
import { PanelShell } from "@/components/venue/shell/PanelShell";
import "./panel.css";

// Private area: keep out of search engines (COMP-004).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VenueLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const venue = await getCurrentVenue(supabase);

  if (!venue) {
    redirect("/login");
  }

  return <PanelShell venueName={venue.name}>{children}</PanelShell>;
}
