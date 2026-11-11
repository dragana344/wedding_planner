import { Cormorant_Garamond } from "next/font/google";
import { Icon } from "@/components/venue/shell/Icon";
import { COURSE_LABELS, COURSE_ORDER, type ProgramDish } from "@/lib/couple/invitation-program";
import type { CoupleEventMenu } from "@/lib/couple/menu";
import "./EventMenusView.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400" });

export const NO_MENUS_MESSAGE = "Салата сè уште нема поставено мени.";

const COURSE_ICON: Record<ProgramDish["course"], string> = {
  starter: "salad",
  main: "meat",
  dessert: "cake",
  other: "cutlery",
};

/** A small gold twig, flanking each menu card's badge — flip for the right side. */
function Twig({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 40 24" className="cm-twig" style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      <path d="M2 20c10-1 18-7 22-18" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <ellipse cx="11" cy="15" rx="3.4" ry="1.7" transform="rotate(-40 11 15)" fill="currentColor" />
      <ellipse cx="18" cy="9" rx="3" ry="1.5" transform="rotate(-40 18 9)" fill="currentColor" />
      <ellipse cx="24" cy="4" rx="2.4" ry="1.2" transform="rotate(-40 24 4)" fill="currentColor" />
    </svg>
  );
}

/** Read-only list of the menus the venue set for this event — one printed-menu-style card per menu, side by side. */
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
    <div className="cm-grid">
      {menus.map((menu) => {
        const count = countById.get(menu.id);
        const groups = COURSE_ORDER.map((course) => [course, menu.dishes.filter((d) => d.course === course)] as const).filter(
          ([, dishes]) => dishes.length > 0
        );
        return (
          <section key={menu.id} className="cm-card">
            <Twig />
            <Twig flip />
            <span className={`cm-badge ${menu.isCustom ? "cm-badge-alt" : ""}`}>
              <Icon name="cutlery" size="sm" />
              {menu.isCustom ? "АЛТЕРНАТИВНО МЕНИ" : "ГЛАВНО МЕНИ"}
            </span>
            <h2 className={`cm-title ${cormorant.className}`}>{menu.name}</h2>
            {count !== undefined ? (
              <span className="cm-guests">
                <Icon name="users" size="sm" />
                {count} гости
              </span>
            ) : null}
            <div className="cm-divider">
              <span />
              <i />
              <span />
            </div>
            {menu.dishes.length === 0 ? (
              <p className="menu-preview-item">Нема јадења.</p>
            ) : (
              <div>
                {groups.map(([course, dishes]) => (
                  <div key={course} className="cm-course">
                    {dishes.map((dish, i) => (
                      <div key={`${course}-${dish.name}-${i}`} className="cm-dish-row">
                        <span className="cm-dish-icon">
                          <Icon name={COURSE_ICON[course]} size="sm" />
                        </span>
                        <span>
                          <p className="cm-dish-name">{dish.name}</p>
                          <p className="cm-dish-course">{COURSE_LABELS[course]}</p>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
