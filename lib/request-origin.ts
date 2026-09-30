import "server-only";
import { headers } from "next/headers";
import { resolveOrigin } from "./origin";

/** This site's origin as the browser sees it (for links printed in QR codes). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((name) => h.get(name), process.env.NEXT_PUBLIC_SITE_URL);
}
