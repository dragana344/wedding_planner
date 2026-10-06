import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LogoMark, Wordmark } from "@/components/marketing/BrandLogo";
import { ContactForm } from "@/components/marketing/ContactForm";
import { DashboardPreview } from "@/components/marketing/DashboardPreview";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { montserrat, nunito } from "@/components/marketing/fonts";

function Landing({ children }: { children: React.ReactNode }) {
  return <div className={`lp ${montserrat.variable} ${nunito.variable}`}>{children}</div>;
}

const meta: Meta = {
  title: "Почетна страна/Делови",
  parameters: { nextjs: { navigation: { pathname: "/" } } },
  decorators: [(Story) => <Landing><Story /></Landing>],
};
export default meta;

type Story = StoryObj;

export const Logo: Story = {
  name: "Лого",
  render: () => (
    <div style={{ display: "flex", gap: 40, alignItems: "center", padding: 40, flexWrap: "wrap" }}>
      <div style={{ width: 96 }}><LogoMark id="sb-mark" /></div>
      <div style={{ width: 320 }}><Wordmark id="sb-word" /></div>
      <div style={{ width: 220 }}><Wordmark id="sb-word-plain" tagline={false} /></div>
    </div>
  ),
};

export const Navigacija: Story = { name: "Навигација", render: () => <MarketingNav /> };

export const KontrolnaTabla: Story = {
  name: "Контролна табла (приказ)",
  render: () => (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <DashboardPreview />
    </div>
  ),
};

export const KontaktForma: Story = {
  name: "Контакт форма",
  render: () => (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
      <ContactForm />
    </div>
  ),
};

export const Footer: Story = { name: "Футер", render: () => <MarketingFooter /> };
