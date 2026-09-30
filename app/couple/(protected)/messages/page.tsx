import { redirect } from "next/navigation";

// D3: messages are not built yet and are hidden from the navigation; an old
// bookmark lands on the couple's home page instead of a placeholder.
export default function MessagesPage() {
  redirect("/couple");
}
