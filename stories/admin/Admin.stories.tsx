import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AdminShell } from "@/components/admin/AdminShell";
import { FeatureOverridesEditor } from "@/components/admin/FeatureOverridesEditor";
import { PlanFeaturesEditor } from "@/components/admin/PlanFeaturesEditor";
import { PricingCardsEditor } from "@/components/admin/PricingCardsEditor";
import { FEATURES, type FeatureMap } from "@/lib/entitlements/features";
import { allFeatures } from "../fixtures";

// Saving goes nowhere in Storybook: the editors only show their own state.
const saved = async () => ({ ok: true as const, data: null });

const TRIAL_LIMITS: Record<string, number> = { rooms: 1, active_events: 1, guests_per_event: 30 };
const trialPlan = Object.fromEntries(FEATURES.map((f, i) => [f.key, { enabled: i % 3 !== 2, limit: TRIAL_LIMITS[f.key] ?? null }]));
const trialFeatures = trialPlan as FeatureMap;

const meta: Meta<typeof AdminShell> = {
  title: "Сопственик/Админ панел",
  component: AdminShell,
  parameters: { nextjs: { navigation: { pathname: "/pricing" } } },
};
export default meta;

type Story = StoryObj<typeof AdminShell>;

export const Pricing: Story = {
  name: "Ценовник",
  args: {
    children: (
      <div className="wrap">
        <PricingCardsEditor
          cards={[
            { id: "p1", name: "START", price: "1.900 ден", period: "месечно", features: ["1 сала", "До 5 активни настани", "Покани и гости"], isFeatured: false, isPublished: true, sortOrder: 10 },
            { id: "p2", name: "PREMIUM", price: "3.900 ден", period: "месечно", features: ["3 сали", "Неограничени настани", "Албум со фотографии", "Извештаи"], isFeatured: true, isPublished: true, sortOrder: 20 },
            { id: "p3", name: "ULTRA", price: "По договор", period: null, features: ["Сè од PREMIUM", "Брендирање на локалот"], isFeatured: false, isPublished: false, sortOrder: 30 },
          ]}
        />
      </div>
    ),
  },
};

export const PricingEmpty: Story = { name: "Ценовник: без картички", args: { children: <div className="wrap"><PricingCardsEditor cards={[]} /></div> } };

export const PlanTop: Story = {
  name: "Ниво: сè вклучено",
  parameters: { nextjs: { navigation: { pathname: "/plans" } } },
  args: { children: <div className="wrap"><section className="panel"><PlanFeaturesEditor initial={allFeatures} onSave={saved} /></section></div> },
};

export const PlanTrial: Story = {
  name: "Ниво: пробно со ограничувања",
  parameters: { nextjs: { navigation: { pathname: "/plans" } } },
  args: { children: <div className="wrap"><section className="panel"><PlanFeaturesEditor initial={trialPlan} onSave={saved} /></section></div> },
};

export const VenueOverrides: Story = {
  name: "Исклучоци за локал",
  parameters: { nextjs: { navigation: { pathname: "/venues" } } },
  args: {
    children: (
      <div className="wrap">
        <FeatureOverridesEditor
          scope="venue"
          features={trialFeatures}
          overrides={[
            { featureKey: "reports", enabled: true, limitOverride: false, limitValue: null, note: "Подарок до крај на годината" },
            { featureKey: "guests_per_event", enabled: null, limitOverride: true, limitValue: 200, note: null },
          ]}
          onSave={saved}
        />
      </div>
    ),
  },
};

export const EventOverrides: Story = {
  name: "Исклучоци за настан",
  parameters: { nextjs: { navigation: { pathname: "/events" } } },
  args: { children: <div className="wrap"><FeatureOverridesEditor scope="event" features={allFeatures} overrides={[]} onSave={saved} /></div> },
};
