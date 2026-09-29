// SEC-026: RFC 9116 disclosure contact at /.well-known/security.txt. Served
// only when SECURITY_CONTACT_EMAIL is configured; Expires stays a year ahead.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const contact = process.env.SECURITY_CONTACT_EMAIL;
  if (!contact) return new Response("Not found", { status: 404 });

  const origin = new URL(request.url).origin;
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: mk, en",
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
