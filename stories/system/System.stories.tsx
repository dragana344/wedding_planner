import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ErrorScreen } from "@/components/ErrorScreen";
import { LockedBanner } from "@/components/entitlements/LockedBanner";

const meta: Meta<typeof ErrorScreen> = { title: "Системски/Пораки", component: ErrorScreen };
export default meta;

type Story = StoryObj<typeof ErrorScreen>;

export const NotFound: Story = {
  name: "404",
  args: { code: "404", title: "Страницата не постои", message: "Линкот е погрешен или страницата е преместена." },
};

export const ServerError: Story = {
  name: "Грешка со референца",
  args: { code: "500", title: "Нешто не е во ред", message: "Обидете се повторно за неколку минути.", reference: "abc123def" },
};

export const Maintenance: Story = {
  name: "Одржување",
  args: { code: "503", title: "Кратко одржување", message: "Платформата наскоро ќе биде достапна. Вашите податоци се безбедни." },
};

export const LockedVenue: Story = {
  name: "Заклучено: локал",
  render: () => <div className="vp" style={{ padding: 24 }}><LockedBanner audience="venue" /></div>,
};

export const LockedCouple: Story = {
  name: "Заклучено: пар",
  render: () => <div className="vp" style={{ padding: 24 }}><LockedBanner audience="couple" /></div>,
};
