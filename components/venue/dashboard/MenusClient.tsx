"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { MenuItemCard } from "./MenuItemCard";
import { PackageBuilder } from "./PackageBuilder";
import { EventCustomMenusSection } from "./EventCustomMenusSection";
import { MenuItemForm } from "@/components/venue/MenuItemForm";
import { Icon } from "@/components/venue/shell/Icon";
import {
  COURSE_META,
  COURSE_ORDER,
  filterDishes,
  formatPrice,
  type DishFilter,
} from "@/lib/venue/menu-display";
import {
  listEventCustomMenus,
  listMenuItems,
  listMenuTemplatesWithItems,
  type EventCustomMenu,
  type MenuItem,
  type MenuTemplate,
} from "@/lib/venue/menus";

type Tab = "dishes" | "packages";
type TemplateWithItems = MenuTemplate & { items: MenuItem[] };

export function MenusClient({
  venueId,
  initialItems,
  initialTemplates,
  initialCustomMenus = [],
}: {
  venueId: string;
  initialItems: MenuItem[];
  initialTemplates: TemplateWithItems[];
  initialCustomMenus?: EventCustomMenu[];
}) {
  const [tab, setTab] = useState<Tab>("dishes");
  const [items, setItems] = useState(initialItems);
  const [templates, setTemplates] = useState(initialTemplates);
  const [customMenus, setCustomMenus] = useState(initialCustomMenus);
  const [courseFilter, setCourseFilter] = useState<DishFilter>("all");
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  async function refreshItems() {
    // Packages too: deleting a dish removes it from every package (cascade),
    // and a renamed/repriced dish must not keep its old look on the package
    // cards — stale packages made the next package save fail.
    const [nextItems, nextTemplates] = await Promise.all([
      listMenuItems(venueId),
      listMenuTemplatesWithItems(venueId),
    ]);
    setItems(nextItems);
    setTemplates(nextTemplates);
    setShowAddItem(false);
  }

  async function refreshTemplates() {
    setTemplates(await listMenuTemplatesWithItems(venueId));
  }

  async function refreshAllTemplates() {
    const [nextTemplates, nextCustom] = await Promise.all([
      listMenuTemplatesWithItems(venueId),
      listEventCustomMenus(venueId),
    ]);
    setTemplates(nextTemplates);
    setCustomMenus(nextCustom);
  }

  const vegetarianCount = items.filter((item) => item.is_vegetarian).length;
  const editingTemplate =
    templates.find((t) => t.id === editingTemplateId) ?? null;
  const visibleItems = filterDishes(items, courseFilter);

  return (
    <div className="wrap">
      <section
        className="tiles"
        style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}
      >
        <div className="tile">
          <span className="badge mp-badge">
            <Icon name="book" size="lg" />
          </span>
          <div>
            <div className="num">{templates.length}</div>
            <div className="lab">готови пакети</div>
          </div>
        </div>
        <div className="tile">
          <span className="badge mp-badge">
            <Icon name="cutlery" size="lg" />
          </span>
          <div>
            <div className="num">{items.length}</div>
            <div className="lab">јадења за настани</div>
          </div>
        </div>
        <div className="tile">
          <span className="badge mp-badge">
            <Icon name="leaf" size="lg" />
          </span>
          <div>
            <div className="num">{vegetarianCount}</div>
            <div className="lab">вегетаријански јадења</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Мени / Пакети</h2>
          <div className="seg">
            <button
              type="button"
              aria-pressed={tab === "dishes"}
              onClick={() => setTab("dishes")}
            >
              Јадења
            </button>
            <button
              type="button"
              aria-pressed={tab === "packages"}
              onClick={() => setTab("packages")}
            >
              Пакети
            </button>
          </div>
          {tab === "packages" ? (
            <button
              className="btn btn-gold"
              type="button"
              onClick={() => setCreatingTemplate(true)}
            >
              <Icon name="plus" size="sm" /> Нов пакет
            </button>
          ) : (
            <button
              className="btn btn-gold"
              type="button"
              onClick={() => setShowAddItem(true)}
            >
              <Icon name="plus" size="sm" /> Ново јадење
            </button>
          )}
        </div>

        {tab === "packages" ? (
          <>
            <h3 className="panel-t" style={{ margin: "8px 16px" }}>
              Стандардни пакети
            </h3>
            {templates.length === 0 ? (
              <div className="empty">
                <b>Нема пакети</b>
                Создадете пакет и додадете јадења за да го составите.
                <button
                  className="btn btn-gold"
                  type="button"
                  style={{ marginTop: 12 }}
                  onClick={() => setCreatingTemplate(true)}
                >
                  <Icon name="plus" size="sm" /> Нов пакет
                </button>
              </div>
            ) : (
              <div className="mp-pk-grid" style={{ padding: "0 16px 16px" }}>
                {templates.map((template) => {
                  const veg = template.items.filter(
                    (i) => i.is_vegetarian,
                  ).length;
                  const total = template.items.reduce(
                    (sum, i) => sum + (i.price ?? 0),
                    0,
                  );
                  const groups = COURSE_ORDER.map(
                    (course) =>
                      [
                        course,
                        template.items.filter((i) => i.course === course),
                      ] as const,
                  ).filter(([, dishes]) => dishes.length > 0);
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className="mp-pk-card"
                      onClick={() => setEditingTemplateId(template.id)}
                    >
                      <div className="mp-pk-inner">
                        <p className="mp-pk-name">{template.name}</p>
                        <p className="mp-pk-desc">
                          {template.description ?? ""}
                        </p>
                        <div className="mp-divider">
                          <span />
                          <i />
                          <span />
                        </div>
                        {groups.map(([course, dishes]) => (
                          <div key={course}>
                            <p className="mp-lab mp-pk-course">
                              {COURSE_META[course].label.toUpperCase()}
                            </p>
                            {dishes.map((item) => (
                              <p key={item.id} className="mp-pk-dish">
                                {item.name}
                              </p>
                            ))}
                          </div>
                        ))}
                        <p className="mp-pk-foot">
                          {template.items.length}{" "}
                          {template.items.length === 1 ? "јадење" : "јадења"} ·{" "}
                          {veg} вегетаријански
                        </p>
                        <p className="mp-pk-total">
                          ≈ {formatPrice(total)} по гостин
                        </p>
                      </div>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="mp-pk-new"
                  onClick={() => setCreatingTemplate(true)}
                >
                  <span className="mp-th" style={{ width: 52, height: 52 }}>
                    <Icon name="plus" size="lg" />
                  </span>
                  Креирај нов пакет
                </button>
              </div>
            )}
            <EventCustomMenusSection
              venueId={venueId}
              menus={customMenus}
              items={items}
              onChanged={refreshAllTemplates}
            />
          </>
        ) : items.length === 0 ? (
          <div className="empty">
            <b>Нема јадења</b>
            Додадете јадења достапни за свадби, крштевки и други настани.
          </div>
        ) : (
          <div style={{ padding: "6px 16px 16px" }}>
            <div className="mp-chips">
              <button
                type="button"
                className="mp-chip"
                aria-pressed={courseFilter === "all"}
                onClick={() => setCourseFilter("all")}
              >
                Сите
              </button>
              {COURSE_ORDER.map((course) => (
                <button
                  key={course}
                  type="button"
                  className="mp-chip"
                  aria-pressed={courseFilter === course}
                  onClick={() => setCourseFilter(course)}
                >
                  {COURSE_META[course].label}
                </button>
              ))}
              <button
                type="button"
                className="mp-chip"
                aria-pressed={courseFilter === "posno"}
                onClick={() => setCourseFilter("posno")}
              >
                Посно
              </button>
            </div>
            {COURSE_ORDER.map((course) => {
              const dishes = visibleItems.filter(
                (item) => item.course === course,
              );
              if (dishes.length === 0) return null;
              return (
                <div key={course}>
                  <div className="mp-course-head">
                    <p className="mp-lab">
                      {COURSE_META[course].label.toUpperCase()}
                    </p>
                    <span className="line" />
                    <span className="count">{dishes.length}</span>
                  </div>
                  {dishes.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      venueId={venueId}
                      onChanged={refreshItems}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showAddItem ? (
        <Modal
          title="Ново јадење"
          onClose={() => {
            setShowAddItem(false);
            // A dish saved before its photo failed still belongs in the list.
            void refreshItems();
          }}
        >
          <MenuItemForm venueId={venueId} onSaved={refreshItems} />
        </Modal>
      ) : null}

      {creatingTemplate ? (
        <Modal
          title="Нов пакет"
          onClose={() => setCreatingTemplate(false)}
          wide
          hideHeader
        >
          <PackageBuilder
            venueId={venueId}
            template={null}
            initialItemIds={[]}
            items={items}
            onClose={() => setCreatingTemplate(false)}
            onChanged={refreshTemplates}
          />
        </Modal>
      ) : null}

      {editingTemplate ? (
        <Modal
          title={editingTemplate.name}
          onClose={() => setEditingTemplateId(null)}
          wide
          hideHeader
        >
          <PackageBuilder
            venueId={venueId}
            template={editingTemplate}
            initialItemIds={editingTemplate.items.map((i) => i.id)}
            items={items}
            onClose={() => setEditingTemplateId(null)}
            onChanged={refreshTemplates}
          />
        </Modal>
      ) : null}
    </div>
  );
}
