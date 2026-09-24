import { redirect } from "next/navigation";

// Брза резервација was merged into /venue/reservations — keep this route
// alive as a redirect so any bookmarks/links don't break.
export default function QuickBookingPage() {
  redirect("/venue/reservations");
}
