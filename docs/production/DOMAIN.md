# Domain, TLS and canonical host (INFRA-002)

1. **Buy** the domain at a registrar with full DNS control (or move DNS to Cloudflare, free). Turn on auto-renew and registrar lock. Don't route the domain's email through a forwarding service; mail is sent from the `mail.` subdomain via Resend ([EMAIL.md](EMAIL.md)).
2. **Pick one canonical host**: the apex `https://<domain>` (recommended: shorter invitation links) or `https://www.<domain>`.
3. **Vercel → wedding-planner → Settings → Domains**: add both `<domain>` and `www.<domain>`. On the non-canonical one choose *Redirect to* the canonical with **308 Permanent**. Vercel keeps path and query and issues/renews TLS automatically; `http://` is redirected to `https://` by the platform.
4. **DNS** records exactly as Vercel shows (apex: `A 76.76.21.21` or the value shown; `www`: `CNAME cname.vercel-dns.com`). If DNS is on Cloudflare, set these records to *DNS only* (grey cloud) so Vercel terminates TLS.
5. **Admin subdomain** (`admin.<domain>`, [ADMIN.md](ADMIN.md)): add it as a third domain on the **same** Vercel project (not a new project — `proxy.ts` routes it purely by Host header, `lib/admin/host.ts`'s `isAdminHost`). It needs its own DNS record too (`admin CNAME cname.vercel-dns.com` or whatever Vercel's domain screen shows) — the apex/`www` records above don't cover it. No redirect: it's a distinct host, not an alias of the canonical one.
6. **Everything that knows the origin**:
   - Supabase Auth Site URL and redirect URL, **plus** `https://admin.<domain>/**` ([AUTH.md](AUTH.md)).
   - GitHub variable `PRODUCTION_URL` ([DEPLOY.md](DEPLOY.md)).
   - Uptime monitors ([MONITORING.md](MONITORING.md)).
   - `SECURITY_CONTACT_EMAIL` on the domain ([SECRETS.md](SECRETS.md)); `/.well-known/security.txt` then serves it.
7. **HSTS** is already sent by the app (`max-age=2 years; includeSubDomains`). Only after everything runs on HTTPS for a few weeks, consider adding `preload` and submitting to hstspreload.org (hard to undo).

## Verify

```bash
curl -sI "http://<domain>/x?y=1"        | grep -i location   # https://<canonical>/x?y=1
curl -sI "https://www.<domain>/x?y=1"   | grep -iE "^HTTP|location"   # 308 → https://<domain>/x?y=1 (if apex is canonical)
curl -sI "https://<domain>/"            | grep -i strict-transport
```
