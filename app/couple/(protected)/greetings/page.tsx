import { headers } from "next/headers";
import { listGreetings } from "@/lib/media/greetings";
import { GreetingsClient } from "@/components/couple/GreetingsClient";

export const dynamic = "force-dynamic";

export default async function GreetingsPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const greetings = await listGreetings(eventId, { includeHidden: true });
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <GreetingsClient initialGreetings={greetings} />
    </main>
  );
}
