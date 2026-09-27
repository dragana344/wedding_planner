"use client";

import {
  Great_Vibes,
  Cormorant_Garamond,
  Marck_Script,
  Playfair_Display,
  EB_Garamond,
  Manrope,
  Amatic_SC,
  Caveat,
} from "next/font/google";
import { RsvpForm } from "./RsvpForm";
import { CountdownTimer, formatMkDate } from "./countdown";
import { FloralCorner, FloralHeart, SwanHeart, GoldFrameCorner, MinimalRule, WatercolorWash, RusticSprig } from "./motifs";
import type { PublicInvitation } from "@/lib/couple/invitations";

// Every display/body font below is chosen for confirmed Cyrillic glyph
// support (checked against next/font/google's subset typings) — couple
// names, venue names, and messages are routinely Macedonian Cyrillic, and a
// latin-only font silently falls back to a generic system face for those
// characters instead of erroring, which is easy to miss without checking.
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400" });
const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });
const marckScript = Marck_Script({ subsets: ["latin", "cyrillic"], weight: "400" });
const playfair = Playfair_Display({ subsets: ["latin", "cyrillic"], weight: ["500", "600"], style: ["italic", "normal"] });
const ebGaramond = EB_Garamond({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });
const amaticSc = Amatic_SC({ subsets: ["latin", "cyrillic"], weight: ["400", "700"] });
const caveat = Caveat({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });

interface InvitationTheme {
  eyebrow: string;
  background: string;
  bodyFont: string;
  displayFontClass: string;
  displayFontSize: number;
  textColor: string;
  mutedColor: string;
  cardBg: string;
  cardTextIsLight: boolean;
  topMotif?: (props: { color: string }) => React.ReactNode;
  bottomMotif?: (props: { color: string }) => React.ReactNode;
  watercolorWash?: boolean;
  bottomStripe?: string;
  uppercaseEyebrow: boolean;
}

const THEMES: Record<string, InvitationTheme> = {
  "romantic-floral": {
    eyebrow: "Со љубов Ве покануваме",
    background: "linear-gradient(180deg, #FBF1EF 0%, #F5DEDA 100%)",
    bodyFont: cormorant.style.fontFamily,
    displayFontClass: marckScript.className,
    displayFontSize: 58,
    textColor: "#7A3B42",
    mutedColor: "#9C6067",
    cardBg: "#FFFFFF",
    cardTextIsLight: false,
    topMotif: ({ color }) => <FloralCorner color={color} />,
    bottomMotif: ({ color }) => <FloralHeart color={color} />,
    uppercaseEyebrow: true,
  },
  "elegant-gold": {
    eyebrow: "Со чест Ве покануваме",
    background: "linear-gradient(180deg, #17140F 0%, #0D0B08 100%)",
    bodyFont: cormorant.style.fontFamily,
    displayFontClass: `${playfair.className} italic`,
    displayFontSize: 52,
    textColor: "#E3BE6E",
    mutedColor: "#B99A56",
    cardBg: "#F6EFDD",
    cardTextIsLight: false,
    topMotif: ({ color }) => <GoldFrameCorner color={color} />,
    bottomMotif: undefined,
    uppercaseEyebrow: true,
  },
  "classic-minimal": {
    eyebrow: "Ве покануваме",
    background: "#FAFAF9",
    bodyFont: ebGaramond.style.fontFamily,
    displayFontClass: ebGaramond.className,
    displayFontSize: 40,
    textColor: "#2C2C2C",
    mutedColor: "#6B6B6B",
    cardBg: "#FFFFFF",
    cardTextIsLight: false,
    topMotif: ({ color }) => <MinimalRule color={color} />,
    bottomMotif: ({ color }) => <MinimalRule color={color} />,
    uppercaseEyebrow: true,
  },
  "modern-watercolor": {
    eyebrow: "You're invited",
    background: "linear-gradient(180deg, #F4F9FD 0%, #E7F1FA 100%)",
    bodyFont: manrope.style.fontFamily,
    displayFontClass: manrope.className,
    displayFontSize: 40,
    textColor: "#3E6690",
    mutedColor: "#6B90B4",
    cardBg: "#FFFFFF",
    cardTextIsLight: false,
    watercolorWash: true,
    uppercaseEyebrow: false,
  },
  rustic: {
    eyebrow: "Ве покануваме со радост",
    background: "linear-gradient(180deg, #EFE2CB 0%, #E3D0AC 100%)",
    bodyFont: caveat.style.fontFamily,
    displayFontClass: amaticSc.className,
    displayFontSize: 76,
    textColor: "#5C3E20",
    mutedColor: "#7C5A3A",
    cardBg: "#FBF4E6",
    cardTextIsLight: false,
    topMotif: ({ color }) => <RusticSprig color={color} />,
    bottomMotif: ({ color }) => <RusticSprig color={color} flip />,
    uppercaseEyebrow: true,
  },
  "royal-green": {
    eyebrow: "Со голема радост Ве покануваме",
    background: "linear-gradient(180deg, #4F5D3A 0%, #3E4A2C 100%)",
    bodyFont: cormorant.style.fontFamily,
    displayFontClass: greatVibes.className,
    displayFontSize: 64,
    textColor: "#F3EEDF",
    mutedColor: "#F3EEDF",
    cardBg: "#F3EEDF",
    cardTextIsLight: true,
    topMotif: ({ color }) => <FloralCorner color={color} />,
    bottomMotif: ({ color }) => <SwanHeart color={color} />,
    bottomStripe: "#F3EEDF",
    uppercaseEyebrow: true,
  },
};

export function FullInvitation({
  slug,
  invitation,
  photoUrl,
}: {
  slug: string;
  invitation: PublicInvitation;
  photoUrl: string | null;
}) {
  const theme = THEMES[invitation.template_id] ?? THEMES["romantic-floral"];
  const target = new Date(`${invitation.event_date}T${invitation.start_time ?? "00:00:00"}`);
  const TopMotif = theme.topMotif;
  const BottomMotif = theme.bottomMotif;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: theme.background,
        fontFamily: theme.bodyFont,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 0",
        overflow: "hidden",
      }}
    >
      {theme.watercolorWash ? <WatercolorWash color={theme.textColor} /> : null}

      <div style={{ width: "100%", maxWidth: 520, textAlign: "center", position: "relative", zIndex: 1 }}>
        {TopMotif ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <TopMotif color={theme.textColor} />
            <TopMotif color={theme.textColor} />
          </div>
        ) : null}

        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            style={{
              width: 128,
              height: 128,
              borderRadius: "50%",
              objectFit: "cover",
              margin: "8px auto 20px",
              border: `2px solid ${theme.textColor}`,
            }}
          />
        ) : null}

        <p
          style={{
            color: theme.mutedColor,
            letterSpacing: "0.25em",
            fontSize: 13,
            textTransform: theme.uppercaseEyebrow ? "uppercase" : "none",
            opacity: 0.85,
            margin: 0,
          }}
        >
          {theme.eyebrow}
        </p>

        <p className={theme.displayFontClass} style={{ color: theme.textColor, fontSize: theme.displayFontSize, margin: "12px 0", lineHeight: 1.15 }}>
          {invitation.couple_names}
        </p>

        <CountdownTimer target={target} color={theme.textColor} fontFamily={theme.bodyFont} />

        <p style={{ color: theme.textColor, fontSize: 19, margin: "4px 0" }}>{formatMkDate(invitation.event_date)}</p>
        <p style={{ color: theme.mutedColor, fontSize: 16, margin: "2px 0 0" }}>
          {invitation.venue_name}
          {invitation.room_names.length > 0 ? ` — ${invitation.room_names.join(", ")}` : ""}
        </p>

        {invitation.message ? (
          <p style={{ color: theme.textColor, fontSize: 16, opacity: 0.9, margin: "20px 0 0", lineHeight: 1.6 }}>{invitation.message}</p>
        ) : null}

        {BottomMotif ? (
          <div style={{ margin: "28px 0 8px" }}>
            <BottomMotif color={theme.textColor} />
          </div>
        ) : null}

        <div
          style={{
            background: theme.cardBg,
            borderRadius: 20,
            padding: "24px 28px 28px",
            margin: "24px 0 40px",
            textAlign: "left",
            boxShadow: "0 20px 40px -20px rgba(0,0,0,0.25)",
          }}
        >
          <RsvpForm slug={slug} accentColor={theme.textColor} />
        </div>
      </div>

      {theme.bottomStripe ? <div style={{ width: "100%", height: 28, background: theme.bottomStripe, opacity: 0.9, position: "relative", zIndex: 1 }} /> : null}
    </main>
  );
}
