import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuestAlbum, type GuestAlbumFeatures } from "@/components/album/GuestAlbum";
import "@/components/album/guest-album.css";
import { RsvpForm } from "@/components/invite/RsvpForm";
import { SeatFinder } from "@/components/invite/SeatFinder";
import { CountdownTimer, DayBanner } from "@/components/invite/countdown";
import { GUEST_TOKEN, invitee } from "../fixtures";

const meta: Meta = { title: "Гости/Делови" };
export default meta;

type Story = StoryObj;

// The album as its page shows it (app/e/[token]/page.tsx): the component
// alone has no stylesheet and no header.
const albumPage = (features?: GuestAlbumFeatures) => (
  <main className="ga-page">
    <header className="ga-header">
      <p className="ga-kicker">Албум</p>
      <h1 className="ga-title">Ана & Марко</h1>
      <p className="ga-date">14 ноември 2026 · Ресторан Панорама</p>
    </header>
    <GuestAlbum token="storybook-album-token" features={features} />
    <p className="ga-footer">Политика за приватност</p>
  </main>
);

const card = (node: React.ReactNode) => <div style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>{node}</div>;

export const RsvpShared: Story = {
  name: "Потврда: заеднички линк",
  render: () => card(<RsvpForm slug="storybook" accentColor="#b0607a" coupleNames="Ана & Марко" venueName="Ресторан Панорама" />),
};

export const RsvpPersonal: Story = {
  name: "Потврда: личен линк",
  render: () => card(<RsvpForm slug="storybook" accentColor="#b0607a" coupleNames="Ана & Марко" invitee={invitee} guestToken={GUEST_TOKEN} />),
};

export const RsvpPersonalConfirmed: Story = {
  name: "Потврда: веќе одговорено",
  render: () =>
    card(
      <RsvpForm
        slug="storybook"
        accentColor="#b0607a"
        invitee={{ ...invitee, rsvpStatus: "confirmed", menuChoice: "standard", childrenCount: 1, rsvpComment: "Едвај чекаме!" }}
        guestToken={GUEST_TOKEN}
      />,
    ),
};

export const KadeSedam: Story = {
  name: "Каде седам?",
  render: () => card(<SeatFinder slug="storybook" color="#b0607a" lineColor="#e8d5dc" />),
};

export const Countdown: Story = {
  name: "Одбројување",
  render: () => card(<CountdownTimer target={new Date(Date.now() + 39 * 86_400_000 + 5 * 3_600_000)} color="#b0607a" />),
};

export const CountdownPassed: Story = {
  name: "Одбројување: поминат датум",
  render: () => card(<CountdownTimer target={new Date("2020-01-01T18:00:00")} color="#b0607a" />),
};

// The banner only shows on the day itself and the day before.
const skopjeDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Skopje" });

export const DayToday: Story = {
  name: "Лента: денес е денот",
  render: () => card(<DayBanner eventDate={skopjeDay(0)} color="#b0607a" />),
};

export const DayTomorrow: Story = {
  name: "Лента: утре е денот",
  render: () => card(<DayBanner eventDate={skopjeDay(1)} color="#b0607a" />),
};

export const AlbumAll: Story = {
  name: "Албум: фотографии, честитки, видео",
  render: () => albumPage(),
};

export const AlbumPhotosOnly: Story = {
  name: "Албум: само фотографии",
  render: () => albumPage({ photos: true, greetings: false, video: false }),
};

export const AlbumNoVideo: Story = {
  name: "Албум: фотографии и честитки, без видео",
  render: () => albumPage({ photos: true, greetings: true, video: false }),
};

export const AlbumNothing: Story = {
  name: "Албум: ништо во пакетот",
  render: () => albumPage({ photos: false, greetings: false, video: false }),
};
