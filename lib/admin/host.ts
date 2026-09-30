// The platform admin dashboard lives on its own subdomain (spec §3.1):
// admin.<domain> in production, admin.localhost:<port> locally.
export function isAdminHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return /^admin\.[^.]/i.test(host.trim());
}
