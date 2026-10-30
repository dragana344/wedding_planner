import { Cormorant_Garamond } from "next/font/google";
import { COURSE_LABELS } from "@/lib/couple/invitation-program";
import type { CoupleEventMenu } from "@/lib/couple/menu";
import "@/components/couple/InvitationCard.css";
import "./MenuPicker.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400" });

export const NO_MENUS_MESSAGE = "Салата сè уште нема поставено мени.";

/** Read-only list of the menus the venue set for this event. */
export function EventMenusView({ menus, totals }: { menus: CoupleEventMenu[]; totals?: { id: string; count: number }[] }) {
  if (menus.length === 0) {
    return (
      <div className="panel couple-card">
        <p style={{ margin: 0 }}>{NO_MENUS_MESSAGE}</p>
      </div>
    );
  }
  const countById = new Map((totals ?? []).map((t) => [t.id, t.count]));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {menus.map((menu) => {
        const count = countById.get(menu.id);
        return (
          <section key={menu.id} className="panel couple-card invite-card">
            <h2 className={`invite-title ${cormorant.className}`}>{menu.name}</h2>
            {count !== undefined && <p className="menu-preview-course">{`${count} гости`}</p>}
            {menu.dishes.length === 0 ? (
              <p className="menu-preview-item">Нема јадења.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {menu.dishes.map((dish, i) => (
                  <li key={`${dish.course}-${dish.name}-${i}`} className="menu-item-row">
                    <span>
                      <span className="menu-item-row-name">{dish.name}</span>
                      <span className="menu-item-row-course">{COURSE_LABELS[dish.course]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
