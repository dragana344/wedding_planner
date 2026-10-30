import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FullInvitation } from "@/components/invite/FullInvitation";
import { DEMO_LOGO, GUEST_TOKEN, invitation, invitee } from "../fixtures";

const meta: Meta<typeof FullInvitation> = {
  title: "Гости/Покана",
  component: FullInvitation,
  args: { slug: "storybook", invitation, photoUrl: null },
  parameters: { nextjs: { navigation: { pathname: "/invite/storybook" } } },
};
export default meta;

type Story = StoryObj<typeof FullInvitation>;

const template = (template_id: string) => ({ invitation: { ...invitation, template_id } });

export const RomanticFloral: Story = { name: "Шаблон: романтичен цветен" };
export const ElegantGold: Story = { name: "Шаблон: елегантно злато", args: template("elegant-gold") };
export const ClassicMinimal: Story = { name: "Шаблон: класичен минимален", args: template("classic-minimal") };
export const ModernWatercolor: Story = { name: "Шаблон: модерен акварел", args: template("modern-watercolor") };
export const RoyalGreen: Story = { name: "Шаблон: кралско зелено", args: template("royal-green") };

export const PersonalLinkSeated: Story = {
  name: "Личен линк: со маса",
  args: { invitee, guestToken: GUEST_TOKEN, mySeat: { found: true, seat: { table_label: "Маса 4", seat_number: 3, room_name: "Голема сала" } } },
};

export const PersonalLinkNoSeatYet: Story = {
  name: "Личен линк: распоредот не е готов",
  args: { invitee, guestToken: GUEST_TOKEN, mySeat: { found: true, seat: null } },
};

export const PersonalLinkAnswered: Story = {
  name: "Личен линк: веќе потврдил",
  args: {
    invitee: { ...invitee, rsvpStatus: "confirmed", allergies: "јаткасти плодови" },
    guestToken: GUEST_TOKEN,
    mySeat: { found: true, seat: null },
  },
};

export const PersonalLinkDeclined: Story = {
  name: "Личен линк: одбил",
  args: { invitee: { ...invitee, rsvpStatus: "declined" }, guestToken: GUEST_TOKEN, mySeat: { found: false, seat: null } },
};

export const NoSeatingInPackage: Story = {
  name: "Без распоред во пакетот",
  args: { invitation: { ...invitation, seating_enabled: false } },
};

export const Bare: Story = {
  name: "Само основно (без програма, локации, мени)",
  args: { invitation: { ...invitation, message: null, agenda: [], locations: [], menus: [] } },
};

export const WithVenueLogo: Story = {
  name: "Со лого на локалот",
  args: { invitation: { ...invitation, venue_logo_url: DEMO_LOGO } },
};

export const LongNames: Story = {
  name: "Долги имиња",
  args: {
    invitation: {
      ...invitation,
      couple_names: "Александра-Марија Константиновска & Христијан Јовановски-Петрушевски",
      venue_name: "Ресторан и сала за свечености „Панорама на Водно“",
    },
  },
};

// Every template in the two states that most often break a layout.
const LONG = {
  couple_names: "Александра-Марија Константиновска & Христијан Јовановски-Петрушевски",
  venue_name: "Ресторан и сала за свечености „Панорама на Водно“",
};
const BARE = { message: null, agenda: [], locations: [], menus: [] };

export const RomanticFloralLongNames: Story = { name: "Долги имиња: романтичен цветен", args: { invitation: { ...invitation, ...LONG, template_id: "romantic-floral" } } };
export const RomanticFloralBare: Story = { name: "Само основно: романтичен цветен", args: { invitation: { ...invitation, ...BARE, template_id: "romantic-floral" } } };
export const ElegantGoldLongNames: Story = { name: "Долги имиња: елегантно злато", args: { invitation: { ...invitation, ...LONG, template_id: "elegant-gold" } } };
export const ElegantGoldBare: Story = { name: "Само основно: елегантно злато", args: { invitation: { ...invitation, ...BARE, template_id: "elegant-gold" } } };
export const ClassicMinimalLongNames: Story = { name: "Долги имиња: класичен минимален", args: { invitation: { ...invitation, ...LONG, template_id: "classic-minimal" } } };
export const ClassicMinimalBare: Story = { name: "Само основно: класичен минимален", args: { invitation: { ...invitation, ...BARE, template_id: "classic-minimal" } } };
export const ModernWatercolorLongNames: Story = { name: "Долги имиња: модерен акварел", args: { invitation: { ...invitation, ...LONG, template_id: "modern-watercolor" } } };
export const ModernWatercolorBare: Story = { name: "Само основно: модерен акварел", args: { invitation: { ...invitation, ...BARE, template_id: "modern-watercolor" } } };
export const RoyalGreenLongNames: Story = { name: "Долги имиња: кралско зелено", args: { invitation: { ...invitation, ...LONG, template_id: "royal-green" } } };
export const RoyalGreenBare: Story = { name: "Само основно: кралско зелено", args: { invitation: { ...invitation, ...BARE, template_id: "royal-green" } } };

export const Phone: Story = { name: "На телефон", globals: { viewport: { value: "mobile1" } } };
