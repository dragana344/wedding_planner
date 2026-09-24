import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { PanelShell } from "@/components/venue/shell/PanelShell";
import "./panel.css";

export default async function VenueLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);

  if (!venueId) {
    redirect("/login");
  }

  const { data: venue } = await supabase.from("venues").select("name").eq("id", venueId).single();

  return <PanelShell venueName={venue?.name ?? "Локал"}>{children}</PanelShell>;
}
