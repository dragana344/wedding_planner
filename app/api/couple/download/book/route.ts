import { withCoupleEvent } from "@/lib/api/handler";
import { bookTitle, renderWeddingBook } from "@/lib/couple/keepsake/book";
import { loadKeepsake } from "@/lib/couple/keepsake/load";
import { attachmentDisposition, safeFileName } from "@/lib/couple/keepsake/names";

// Group A task 7: the wedding book PDF ("Преземи ја вашата свадба"). GET only,
// so it keeps working in the read-only period; no `feature`, so a downgrade
// never takes it away. The PDF is built in memory: it is text and one photo.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const data = await loadKeepsake(eventId);
    const pdf = await renderWeddingBook(data);
    const name = `${bookTitle(data)} — ${safeFileName(data.coupleNames, "свадба")}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": attachmentDisposition(name, data.isWedding ? "svadbena-kniga.pdf" : "spomen-kniga.pdf"),
        "cache-control": "no-store",
      },
    });
  },
  { fallbackError: "Не успеа подготвувањето на книгата." },
);
