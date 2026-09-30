# Performance notes

## Client bundle baseline (PERF-003)

Measured 29 Sep 2026 on Next.js 16.3.7 (Turbopack production build) with `npm run build && npm run bundle:report -- --markdown`. CI prints the same table in every run's summary; compare against this before merging anything that adds a dependency to client components. For a per-module breakdown run `npx next experimental-analyze`.

| Chunk | Raw | Gzip |
|---|---|---|
| `3z75rkxv82y2t.js` | 443.0 kB | 137.3 kB |
| `0rnfcueji6-4z.js` | 246.1 kB | 64.8 kB |
| `20rz4r9qomiof.js` | 156.2 kB | 42.8 kB |
| `0cz1d0mv5g_q7.js` | 110.0 kB | 38.5 kB |
| `3ua3b97n_il8c.js` | 44.3 kB | 15.5 kB |
| `0e19xb0oggqx0.js` | 51.5 kB | 13.0 kB |
| `1e-jqd_2dgwpl.js` | 28.5 kB | 10.6 kB |
| `0b_rwtbwmi3sa.js` | 32.8 kB | 8.8 kB |
| `41x1ncohpn80s.js` | 34.4 kB | 8.7 kB |
| `0ttsbqaohnow2.js` | 30.5 kB | 8.6 kB |
| `0u7b2-ct4_7y6.js` | 30.5 kB | 7.7 kB |
| `36v4dckh28w7o.js` | 26.6 kB | 6.6 kB |
| `20goyit-zec7f.js` | 27.2 kB | 6.3 kB |
| `22euarh0qiwp9.js` | 22.3 kB | 6.0 kB |
| `1rgc_epgwhvou.js` | 20.9 kB | 5.8 kB |
| **All 44 chunks** | **1562.8 kB** | **463.8 kB** |

## Caching (PERF-001)

- Next.js serves `/_next/static/*` with `Cache-Control: public, max-age=31536000, immutable` (content-hashed file names).
- Photos are uploaded with `cacheControl: 31536000`; every upload gets a new path, so a cached photo never goes stale.
- `images.remotePatterns` allows `next/image` for `…/storage/v1/object/public/**` on the configured Supabase host. The existing `<img>` tags are unchanged (switching them is a separate frontend change).

## Query bounds (PERF-002)

Every list of a user-growable table has an explicit `.limit(1000)` (`lib/list-bound.ts`), matching Supabase's API row cap, and logs `list_bound_reached` when a list hits it. Realistic maxima are far lower (a large wedding ≈ 500 guests). Lookups by a bounded id list and small venue-configuration tables (rooms, table types, menus) are not bounded.

## Latency

The app and database must share a region (`dub1` ↔ `eu-west-1`): every server render makes several sequential Supabase calls. Measured from a laptop in Skopje to `eu-west-1`: 120–370 ms per call; same-region it is single-digit ms. Load test plan: [LOADTEST.md](LOADTEST.md) (TEST-008).
