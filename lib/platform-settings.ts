import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// DB-stored maintenance flag (admin → Систем, task 4.1), read by proxy.ts on
// every request. proxy.ts is a hot path and must never *await* this
// module's own database call (controller ruling) — it reads
// peekMaintenanceMode() synchronously and, when the cache is stale or cold,
// starts refreshMaintenanceMode() in the background without awaiting it.
//
// IMPORTANT: proxy.ts and the admin Server Actions are separate deployed
// function bundles, each with their own copy of this module's state.
// Nothing invalidates or refreshes proxy's copy from here — the only thing
// that actually crosses that boundary is the database row itself, which is
// why a change made from the admin System page can take up to TTL_MS to
// reach a live proxy instance.
const TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 1_500;

let cached: { value: boolean; at: number } | null = null;
let inFlight: Promise<boolean> | null = null;

/** Test-only: clears this module instance's cache so the next read starts cold. */
export function invalidateMaintenanceCache(): void {
  cached = null;
  inFlight = null;
}

/**
 * Synchronous read of the last known DB maintenance flag in *this* module
 * instance — never touches the network. `false` when nothing has been
 * fetched yet (cold start): the same fail-open default as an unreachable
 * database, so a fresh instance never blocks traffic while it warms up.
 */
export function peekMaintenanceMode(): boolean {
  return cached?.value ?? false;
}

/** True when the cache is missing or older than TTL_MS — due for a refresh. */
export function isMaintenanceModeStale(): boolean {
  return !cached || Date.now() - cached.at >= TTL_MS;
}

/**
 * Refreshes the cache from the database. Concurrent callers share one
 * in-flight request instead of each starting their own. Bounded to
 * FETCH_TIMEOUT_MS; on any error (including the timeout) the cache falls
 * back to its last known value, or `false` if it never had one — this
 * function never throws and never takes longer than FETCH_TIMEOUT_MS.
 * Meant to be started in the background (event.waitUntil in proxy.ts, or
 * plain fire-and-forget) and awaited directly only off the hot path (a DB
 * test, a script) — awaiting it from a request handler defeats the point.
 */
export function refreshMaintenanceMode(): Promise<boolean> {
  if (inFlight) return inFlight;
  const promise = (async () => {
    let value: boolean;
    try {
      const { data, error } = await createServiceRoleClient()
        .from("platform_settings")
        .select("maintenance_mode")
        .eq("id", true)
        .abortSignal(AbortSignal.timeout(FETCH_TIMEOUT_MS))
        .single();
      if (error) throw error;
      value = data.maintenance_mode === true;
    } catch {
      value = cached?.value ?? false;
    }
    cached = { value, at: Date.now() };
    return value;
  })();
  inFlight = promise;
  void promise.finally(() => {
    inFlight = null;
  });
  return promise;
}
