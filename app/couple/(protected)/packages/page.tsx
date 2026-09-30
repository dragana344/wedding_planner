import { FEATURES } from "@/lib/entitlements/features";
import { listPackagesForDisplay } from "@/lib/entitlements/packages";

// Private area: not indexed, and re-checked on every visit — no payments
// exist yet, so this is a read-only reference page (admin dashboard spec
// §4.4 / E3), not a checkout flow.
export const dynamic = "force-dynamic";

const EVENT_FEATURES = FEATURES.filter((f) => f.scope === "event");

export default async function PackagesPage() {
  const packages = await listPackagesForDisplay();

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        Пакети
      </h1>
      <p className="page-sub" style={{ marginBottom: 16 }}>
        Преглед на достапните пакети и функции.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
        {packages.map((pkg) => (
          <section key={pkg.id} className="panel">
            <div className="panel-h">
              <h2 className="panel-t">{pkg.name}</h2>
            </div>
            <div style={{ padding: "8px 14px 14px" }}>
              {pkg.description ? (
                <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 12px" }}>{pkg.description}</p>
              ) : null}
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {EVENT_FEATURES.map((feature) => {
                  const resolved = pkg.features[feature.key];
                  const value =
                    feature.kind === "switch"
                      ? resolved.enabled
                        ? "Вклучено"
                        : "Заклучено"
                      : !resolved.enabled
                        ? "Заклучено"
                        : resolved.limit === null
                          ? "Неограничено"
                          : String(resolved.limit);
                  return (
                    <li
                      key={feature.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "6px 0",
                        borderBottom: "1px solid var(--line)",
                        fontSize: 13,
                      }}
                    >
                      <span>{feature.label}</span>
                      <b>{value}</b>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 20 }}>
        За активирање контактирајте го вашиот ресторан.
      </p>
    </main>
  );
}
