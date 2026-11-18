import { redirect } from "next/navigation";

// 0156: "Локации" moved into the agenda — each item carries its own place.
// Old bookmarks and links land on the agenda.
export default function LocationsPage() {
  redirect("/couple/agenda");
}
