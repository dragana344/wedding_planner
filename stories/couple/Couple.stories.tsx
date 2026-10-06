import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AgendaClient } from "@/components/couple/AgendaClient";
import { BudgetClient } from "@/components/couple/BudgetClient";
import { GuestsClient } from "@/components/couple/GuestsClient";
import { StorageMeter } from "@/components/couple/StorageMeter";
import { RsvpBreakdown } from "@/components/couple/guests/RsvpBreakdown";
import { CoupleShell } from "@/components/couple/shell/CoupleShell";
import { brandVars } from "@/lib/venue/brand-palette";
import { DEMO_LOGO, EVENT_ID, emptyStats, guestStats, guests } from "../fixtures";

const share = { slug: "storybook", coupleNames: "Ана & Марко", eventDate: "2026-11-14", venueName: "Ресторан Панорама", eventType: "wedding", emailEnabled: false };
const GB = 1024 ** 3;

const meta: Meta<typeof CoupleShell> = {
  title: "Пар/Панел",
  component: CoupleShell,
  args: { coupleNames: "Ана & Марко", eventDate: "2026-11-14", rooms: [{ id: "r1", name: "Голема сала" }] },
  parameters: { nextjs: { navigation: { pathname: "/couple/guests" } } },
};
export default meta;

type Story = StoryObj<typeof CoupleShell>;

export const Guests: Story = {
  name: "Гости",
  args: { children: <GuestsClient initialGuests={guests} initialStats={guestStats} eventType="wedding" share={share} greetingsEnabled /> },
};

export const GuestsEmpty: Story = {
  name: "Гости: празна листа",
  args: { children: <GuestsClient initialGuests={[]} initialStats={emptyStats} eventType="wedding" share={{ ...share, slug: null }} /> },
};

export const GuestsSendingLocked: Story = {
  name: "Гости: праќање не е во пакетот",
  args: { children: <GuestsClient initialGuests={guests} initialStats={guestStats} eventType="wedding" share={share} sendingEnabled={false} /> },
};

export const GuestsCoOrganizer: Story = {
  name: "Гости: ко-организатор (страна на невестата)",
  args: {
    children: <GuestsClient initialGuests={guests.filter((g) => g.side === "bride")} initialStats={guestStats} eventType="wedding" share={share} organizerSide="bride" />,
  },
};

export const GuestsBirthday: Story = {
  name: "Гости: роденден (без страни)",
  args: { children: <GuestsClient initialGuests={guests.map((g) => ({ ...g, side: null }))} initialStats={guestStats} eventType="birthday" share={share} /> },
};

export const GuestsPhone: Story = { ...Guests, name: "Гости: на телефон", globals: { viewport: { value: "mobile1" } } };

export const Breakdown: Story = {
  name: "Одговори на поканата",
  args: {
    children: (
      <div className="wrap" style={{ display: "grid", gap: 16 }}>
        <RsvpBreakdown stats={guestStats} />
        <RsvpBreakdown stats={emptyStats} />
      </div>
    ),
  },
};

export const Agenda: Story = {
  name: "Програма",
  parameters: { nextjs: { navigation: { pathname: "/couple/agenda" } } },
  args: {
    children: (
      <AgendaClient
        initialItems={[
          { id: "a1", event_id: EVENT_ID, time: "17:00", title: "Венчавка во црква", notes: null, sort_order: 10 },
          { id: "a2", event_id: EVENT_ID, time: "18:00", title: "Пречек на гости", notes: "Музика во живо на влез", sort_order: 20 },
          { id: "a3", event_id: EVENT_ID, time: null, title: "Торта", notes: null, sort_order: 30 },
        ]}
      />
    ),
  },
};

export const AgendaEmpty: Story = {
  name: "Програма: празна",
  parameters: { nextjs: { navigation: { pathname: "/couple/agenda" } } },
  args: { children: <AgendaClient initialItems={[]} /> },
};

const budgetItem = (id: string, category: string, name: string, estimated_amount: number | null, paid_amount: number) => ({
  id,
  event_id: EVENT_ID,
  category,
  custom_label: null,
  name,
  estimated_amount,
  paid_amount,
  created_at: "2026-09-01T10:00:00Z",
});

export const Budget: Story = {
  name: "Буџет",
  parameters: { nextjs: { navigation: { pathname: "/couple/budget" } } },
  args: {
    children: (
      <BudgetClient
        initialSummary={{
          venue: { estimated_amount: 240000, paid_amount: 60000 },
          items: [budgetItem("b1", "music", "Бенд", 45000, 15000), budgetItem("b2", "photo", "Фотограф", 36000, 36000), budgetItem("b3", "flowers", "Цвеќе", null, 0)],
          totalEstimated: 321000,
          totalPaid: 111000,
          remaining: 210000,
        }}
      />
    ),
  },
};

export const BudgetOverpaid: Story = {
  name: "Буџет: платено повеќе од планирано",
  parameters: { nextjs: { navigation: { pathname: "/couple/budget" } } },
  args: {
    children: (
      <BudgetClient
        initialSummary={{ venue: { estimated_amount: null, paid_amount: null }, items: [budgetItem("b1", "music", "Бенд", 20000, 30000)], totalEstimated: 20000, totalPaid: 30000, remaining: -10000 }}
      />
    ),
  },
};

export const Storage: Story = {
  name: "Простор за албум",
  parameters: { nextjs: { navigation: { pathname: "/couple/album" } } },
  args: {
    children: (
      <div className="wrap" style={{ display: "grid", gap: 16 }}>
        <StorageMeter usage={{ limitBytes: 5 * GB, photoBytes: 1.2 * GB, videoBytes: 0.8 * GB }} />
        <StorageMeter usage={{ limitBytes: 5 * GB, photoBytes: 3 * GB, videoBytes: 2 * GB }} />
        <StorageMeter usage={{ limitBytes: null, photoBytes: 9 * GB, videoBytes: 4 * GB }} />
        <StorageMeter usage={{ limitBytes: 5 * GB, photoBytes: 0, videoBytes: 0 }} />
      </div>
    ),
  },
};

export const LockedSection: Story = {
  name: "Заклучен дел (замаглен)",
  parameters: { nextjs: { navigation: { pathname: "/couple/budget" } } },
  args: {
    lockedFeatures: ["budget", "photo_album", "notes"],
    children: (
      <BudgetClient
        initialSummary={{ venue: { estimated_amount: 240000, paid_amount: 60000 }, items: [budgetItem("b1", "music", "Бенд", 45000, 15000)], totalEstimated: 285000, totalPaid: 75000, remaining: 210000 }}
      />
    ),
  },
};

export const VenueBranding: Story = {
  ...Guests,
  name: "Со брендирање на локалот",
  args: { ...Guests.args, brand: { logoUrl: DEMO_LOGO, vars: brandVars("#1f6f5b") } },
};

export const TwoRooms: Story = {
  ...Guests,
  name: "Настан во две сали",
  args: { ...Guests.args, rooms: [{ id: "r1", name: "Голема сала" }, { id: "r2", name: "Тераса" }] },
};
