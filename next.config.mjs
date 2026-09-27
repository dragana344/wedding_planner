/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js's client-side Router Cache keeps a snapshot of every visited
    // dynamic page for up to 30s by default, independent of each page's own
    // `export const dynamic = "force-dynamic"` (which only controls the
    // server-side render, not whether the client reuses an old copy). That
    // gap has already caused stale-data bugs on individual pages — the venue
    // dashboard, the room floor-plan editor, and the couple's invitation page
    // (which could show an empty form again right after generating a link,
    // just from navigating away and back). Setting dynamic staleTime to 0
    // closes this whole bug class app-wide instead of chasing it page by
    // page.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
