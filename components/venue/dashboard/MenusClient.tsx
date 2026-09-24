"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { MenuItemCard } from "./MenuItemCard";
import { PackageBuilder } from "./PackageBuilder";
import { MenuItemForm } from "@/components/venue/MenuItemForm";
import { MenuTemplateForm } from "@/components/venue/MenuTemplateForm";
import { Icon } from "@/components/venue/shell/Icon";
import {
  listMenuItems,
  listMenuTemplatesWithItemCounts,
  type MenuItem,
  type MenuTemplateWithItemCount,
} from "@/lib/venue/menus";

type Tab = "everyday" | "special" | "packages";

export function MenusClient({
  venueId,
  initialEverydayItems,
  initialSpecialItems,
  initialTemplates,
}: {
  venueId: string;
  initialEverydayItems: MenuItem[];
  initialSpecialItems: MenuItem[];
  initialTemplates: MenuTemplateWithItemCount[];
}) {
  const [tab, setTab] = useState<Tab>("special");
  const [everydayItems, setEverydayItems] = useState(initialEverydayItems);
  const [specialItems, setSpecialItems] = useState(initialSpecialItems);
  const [templates, setTemplates] = useState(initialTemplates);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  async function refreshItems() {
    const [everyday, special] = await Promise.all([
      listMenuItems(venueId, "everyday"),
      listMenuItems(venueId, "special"),
    ]);
    setEverydayItems(everyday);
    setSpecialItems(special);
    setShowAddItem(false);
  }

  async function refreshTemplates() {
    setTemplates(await listMenuTemplatesWithItemCounts(venueId));
    setShowAddTemplate(false);
  }

  const activeItems = tab === "everyday" ? everydayItems : specialItems;
  const openTemplate = templates.find((t) => t.id === openTemplateId) ?? null;

  return (
    <div className="wrap">
      <section className="tiles" aria-label="Преглед" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div className="tile">
          <span className="badge"><Icon name="note" size="lg" /></span>
          <div>
            <div className="num">{everydayItems.length}</div>
            <div className="lab">Секојдневно<span>јадења</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="star" size="lg" /></span>
          <div>
            <div className="num">{specialItems.length}</div>
            <div className="lab">Специјално<span>јадења за настани</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="menu" size="lg" /></span>
          <div>
            <div className="num">{templates.length}</div>
            <div className="lab">Стандардни менија<span>готови пакети</span></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Мени / Пакети</h2>
          <div className="seg">
            <button type="button" aria-pressed={tab === "everyday"} onClick={() => setTab("everyday")}>
              Секојдневно мени
            </button>
            <button type="button" aria-pressed={tab === "special"} onClick={() => setTab("special")}>
              Специјално мени
            </button>
            <button type="button" aria-pressed={tab === "packages"} onClick={() => setTab("packages")}>
              Стандардни менија
            </button>
          </div>
          {tab === "packages" ? (
            <button className="btn btn-gold" type="button" onClick={() => setShowAddTemplate(true)}>
              <Icon name="plus" size="sm" /> Ново мени
            </button>
          ) : (
            <button className="btn btn-gold" type="button" onClick={() => setShowAddItem(true)}>
              <Icon name="plus" size="sm" /> Ново јадење
            </button>
          )}
        </div>

        {tab === "packages" ? (
          templates.length === 0 ? (
            <div className="empty">
              <b>Нема стандардни менија</b>
              Создадете мени и довлечете јадења од специјалното мени за да го составите пакетот.
            </div>
          ) : (
            <div className="menu-package-grid">
              {templates.map((template) => (
                <button key={template.id} type="button" className="menu-package-card" onClick={() => setOpenTemplateId(template.id)}>
                  <b>{template.name}</b>
                  <span className="muted">
                    {template.itemCount} {template.itemCount === 1 ? "јадење" : "јадења"}
                    {template.vegetarianCount > 0 ? ` · ${template.vegetarianCount} вегетаријански` : ""}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : activeItems.length === 0 ? (
          <div className="empty">
            <b>Нема јадења</b>
            {tab === "everyday" ? "Додадете јадења од секојдневното мени на локалот." : "Додадете јадења достапни за свадби, крштевки и други настани."}
          </div>
        ) : (
          <div style={{ padding: "6px 8px" }}>
            {activeItems.map((item) => (
              <MenuItemCard key={item.id} item={item} venueId={venueId} onChanged={refreshItems} />
            ))}
          </div>
        )}
      </section>

      {showAddItem ? (
        <Modal title={tab === "everyday" ? "Ново секојдневно јадење" : "Ново специјално јадење"} onClose={() => setShowAddItem(false)}>
          <MenuItemForm venueId={venueId} defaultTier={tab === "everyday" ? "everyday" : "special"} onSaved={refreshItems} />
        </Modal>
      ) : null}

      {showAddTemplate ? (
        <Modal title="Ново стандардно мени" onClose={() => setShowAddTemplate(false)}>
          <MenuTemplateForm venueId={venueId} onSaved={refreshTemplates} />
        </Modal>
      ) : null}

      {openTemplate ? (
        <Modal title={openTemplate.name} onClose={() => setOpenTemplateId(null)}>
          <PackageBuilder
            template={openTemplate}
            specialItems={specialItems}
            onClose={() => setOpenTemplateId(null)}
            onChanged={refreshTemplates}
          />
        </Modal>
      ) : null}
    </div>
  );
}
