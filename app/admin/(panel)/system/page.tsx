import { requireAdmin } from "@/lib/admin/guard";
import { getMaintenanceState } from "@/lib/admin/queries";
import { MaintenanceToggle } from "@/components/admin/MaintenanceToggle";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  await requireAdmin({ page: true });
  const envMaintenance = process.env.MAINTENANCE_MODE === "1";
  const release = process.env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

  // Direct, uncached read (Minor 3) — proxy.ts's own copy of the flag can
  // lag up to 30s behind this; showing anything else here (a stale value,
  // or a silent "off" on a failed read) would be actively misleading on a
  // diagnostic page whose whole job is to say what the flag actually is.
  let state: Awaited<ReturnType<typeof getMaintenanceState>> | null = null;
  let loadFailed = false;
  try {
    state = await getMaintenanceState();
  } catch {
    loadFailed = true;
  }

  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Одржување</h2>
        </div>
        <div style={{ padding: "0 20px 16px" }}>
          {loadFailed || !state ? (
            <p className="auth-error">Читањето на состојбата од базата не успеа. Освежете ја страницата.</p>
          ) : (
            <>
              <p>
                Флагот во базата е <strong>{state.maintenanceMode ? "вклучен" : "исклучен"}</strong>. Флагот MAINTENANCE_MODE од околината е{" "}
                <strong>{envMaintenance ? "вклучен" : "исклучен"}</strong>
                {envMaintenance ? " (го надвладува приказот погоре — страницата за одржување е активна без разлика на копчето подолу)" : ""}.
              </p>
              <p className="muted">
                Кога е вклучено, сите сали, парови и гости ја гледаат страницата за одржување наместо платформата; админ панелот не е засегнат.
                Промената важи за најмногу 30 секунди.
              </p>
              <MaintenanceToggle enabled={state.maintenanceMode} />
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Верзија</h2>
        </div>
        <p style={{ padding: "0 20px 16px" }}>Release: {release}</p>
      </section>
    </div>
  );
}
