import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BlockedScreen } from "@/components/venue/BlockedScreen";
import { BrandColorForm } from "@/components/venue/dashboard/BrandColorForm";
import { NotificationsList } from "@/components/venue/dashboard/NotificationsList";
import { ComingSoon } from "@/components/venue/shell/ComingSoon";
import { PanelShell } from "@/components/venue/shell/PanelShell";
import { brandVars } from "@/lib/venue/brand-palette";
import { DEMO_LOGO, EVENT_ID, VENUE_ID } from "../fixtures";

const meta: Meta<typeof PanelShell> = {
  title: "Локал/Панел",
  component: PanelShell,
  args: { venueName: "Ресторан Панорама", children: <ComingSoon icon="chart" title="Содржина на страницата" note="Овде стои избраниот дел од панелот." badge="Приказ" /> },
};
export default meta;

type Story = StoryObj<typeof PanelShell>;

export const Default: Story = { name: "Стандарден изглед" };

export const TrialPlanLocked: Story = {
  name: "Пробен пакет: заклучен дел (замаглен)",
  args: {
    lockedFeatures: ["reports", "venue_branding"],
    children: (
      <div className="wrap">
        <NotificationsList
          today="2026-10-06"
          items={[
            { id: "1", at: "2026-10-06T08:12:00Z", kind: "rsvp_changed", eventId: EVENT_ID, title: "Пример содржина", detail: "Ова стои зад замаглувањето" },
            { id: "2", at: "2026-10-05T15:40:00Z", kind: "event_created", eventId: EVENT_ID, title: "Пример содржина", detail: "Не може да се кликне ниту прочита" },
          ]}
        />
      </div>
    ),
  },
  parameters: { nextjs: { navigation: { pathname: "/venue/reports" } } },
};

export const BrandGreen: Story = {
  name: "Брендирање: зелена + лого",
  args: { brand: { logoUrl: DEMO_LOGO, vars: brandVars("#1f6f5b") } },
};

export const BrandDark: Story = {
  name: "Брендирање: многу темна боја",
  args: { brand: { logoUrl: null, vars: brandVars("#1a1f3d") } },
};

export const BrandLight: Story = {
  name: "Брендирање: многу светла боја",
  args: { brand: { logoUrl: null, vars: brandVars("#f2d14a") } },
};

export const LongVenueName: Story = {
  name: "Долго име на локал",
  args: { venueName: "Ресторан и сала за свечености „Панорама на Водно“ Скопје" },
};

export const Phone: Story = { name: "На телефон", globals: { viewport: { value: "mobile1" } } };

export const Notifications: Story = {
  name: "Известувања",
  parameters: { nextjs: { navigation: { pathname: "/venue/notifications" } } },
  args: {
    children: (
      <div className="wrap">
        <NotificationsList
          today="2026-10-06"
          items={[
            { id: "1", at: "2026-10-06T08:12:00Z", kind: "rsvp_changed", eventId: EVENT_ID, title: "Одговор на поканата", detail: "Ана & Марко" },
            { id: "2", at: "2026-10-05T15:40:00Z", kind: "event_created", eventId: EVENT_ID, title: "Нов настан", detail: "Крштевка — Петровски" },
            { id: "3", at: "2026-10-03T11:05:00Z", kind: "password_regenerated", eventId: EVENT_ID, title: "Нова лозинка за парот", detail: "Ана & Марко" },
          ]}
        />
      </div>
    ),
  },
};

export const NotificationsEmpty: Story = {
  name: "Известувања: празно",
  args: { children: <div className="wrap"><NotificationsList today="2026-10-06" items={[]} /></div> },
};

export const BrandColourAllowed: Story = {
  name: "Поставки: боја на локалот",
  parameters: { nextjs: { navigation: { pathname: "/venue/settings" } } },
  args: { children: <div className="wrap"><BrandColorForm venueId={VENUE_ID} color="#1f6f5b" enabled /></div> },
};

export const BrandColourLocked: Story = {
  name: "Поставки: боја заклучена во пакетот",
  parameters: { nextjs: { navigation: { pathname: "/venue/settings" } } },
  args: { children: <div className="wrap"><BrandColorForm venueId={VENUE_ID} color={null} enabled={false} /></div> },
};

export const Blocked: Story = {
  name: "Блокиран локал",
  render: () => <BlockedScreen reason="Неплатена претплата за септември." />,
};

export const BlockedNoReason: Story = { name: "Блокиран локал: без причина", render: () => <BlockedScreen /> };
