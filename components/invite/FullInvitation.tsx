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
import type { Invitee } from "@/lib/couple/rsvp";
import { CountdownTimer, formatMkDate, formatMkWeekday } from "./countdown";
import { COURSE_LABELS, COURSE_ORDER, mapsHref } from "@/lib/couple/invitation-program";
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
  /** Italic serif for dates, times and countdown numerals. */
  numeralFont: string;
  displayFontClass: string;
  displayFontSize: number;
  textColor: string;
  mutedColor: string;
  /** Hairlines, the photo arch and the programme rule. */
  lineColor: string;
  cardBg: string;
  /** Answer buttons on the RSVP card (white text on it). */
  rsvpAccent: string;
  topMotif?: (props: { color: string }) => React.ReactNode;
  bottomMotif?: (props: { color: string }) => React.ReactNode;
  watercolorWash?: boolean;
  bottomStripe?: string;
}

const THEMES: Record<string, InvitationTheme> = {
  "romantic-floral": {
    eyebrow: "Со љубов Ве покануваме",
    background: "linear-gradient(180deg, #FBF1EF 0%, #F5DEDA 100%)",
    bodyFont: cormorant.style.fontFamily,
    numeralFont: playfair.style.fontFamily,
    displayFontClass: marckScript.className,
    displayFontSize: 54,
    textColor: "#7A3B42",
    mutedColor: "#8E545B",
    lineColor: "#D9A5AB",
    cardBg: "#FFFFFF",
    rsvpAccent: "#7A3B42",
    topMotif: ({ color }) => <FloralCorner color={color} />,
    bottomMotif: ({ color }) => <FloralHeart color={color} />,
  },
  // The house style for guest pages (MASTER §5): cream paper, antique gold.
  "elegant-gold": {
    eyebrow: "Со чест Ве покануваме",
    background: "#F5EFE4",
    bodyFont: cormorant.style.fontFamily,
    numeralFont: playfair.style.fontFamily,
    displayFontClass: `${playfair.className} italic`,
    displayFontSize: 48,
    textColor: "#3A2E1F",
    mutedColor: "#6E5E45",
    lineColor: "#B8913A",
    cardBg: "#FFFBF3",
    rsvpAccent: "#8C6A22",
    topMotif: ({ color }) => <GoldFrameCorner color={color} />,
  },
  "classic-minimal": {
    eyebrow: "Ве покануваме",
    background: "#FAFAF9",
    bodyFont: ebGaramond.style.fontFamily,
    numeralFont: ebGaramond.style.fontFamily,
    displayFontClass: ebGaramond.className,
    displayFontSize: 40,
    textColor: "#2C2C2C",
    mutedColor: "#5E5E5E",
    lineColor: "#BDBDBD",
    cardBg: "#FFFFFF",
    rsvpAccent: "#2C2C2C",
    topMotif: ({ color }) => <MinimalRule color={color} />,
    bottomMotif: ({ color }) => <MinimalRule color={color} />,
  },
  "modern-watercolor": {
    eyebrow: "Ве покануваме",
    background: "linear-gradient(180deg, #F4F9FD 0%, #E7F1FA 100%)",
    bodyFont: manrope.style.fontFamily,
    numeralFont: playfair.style.fontFamily,
    displayFontClass: manrope.className,
    displayFontSize: 40,
    textColor: "#2F5578",
    mutedColor: "#4F7397",
    lineColor: "#9FBFDD",
    cardBg: "#FFFFFF",
    rsvpAccent: "#2F5578",
    watercolorWash: true,
  },
  rustic: {
    eyebrow: "Ве покануваме со радост",
    background: "linear-gradient(180deg, #EFE2CB 0%, #E3D0AC 100%)",
    bodyFont: caveat.style.fontFamily,
    numeralFont: caveat.style.fontFamily,
    displayFontClass: amaticSc.className,
    displayFontSize: 68,
    textColor: "#5C3E20",
    mutedColor: "#6E4E2F",
    lineColor: "#A07A52",
    cardBg: "#FBF4E6",
    rsvpAccent: "#5C3E20",
    topMotif: ({ color }) => <RusticSprig color={color} />,
    bottomMotif: ({ color }) => <RusticSprig color={color} flip />,
  },
  "royal-green": {
    eyebrow: "Со голема радост Ве покануваме",
    background: "linear-gradient(180deg, #4F5D3A 0%, #3E4A2C 100%)",
    bodyFont: cormorant.style.fontFamily,
    numeralFont: playfair.style.fontFamily,
    displayFontClass: greatVibes.className,
    displayFontSize: 58,
    textColor: "#F3EEDF",
    mutedColor: "#E4DDC8",
    lineColor: "#C9BC94",
    cardBg: "#F3EEDF",
    rsvpAccent: "#4F5D3A",
    topMotif: ({ color }) => <FloralCorner color={color} />,
    bottomMotif: ({ color }) => <SwanHeart color={color} />,
    bottomStripe: "#F3EEDF",
  },
};

/** "12.06.2027" */
function numericDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function Section({ title, theme, children }: { title: string; theme: InvitationTheme; children: React.ReactNode }) {
  const id = `invite-section-${title}`;
  return (
    <section aria-labelledby={id} style={{ margin: "36px 0 0", textAlign: "center" }}>
      <h2 id={id} className={theme.displayFontClass} style={{ color: theme.textColor, fontSize: 30, fontWeight: 400, margin: "0 0 14px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function FullInvitation({
  slug,
  invitation,
  photoUrl,
  invitee = null,
  guestToken,
}: {
  slug: string;
  invitation: PublicInvitation;
  photoUrl: string | null;
  /** The guest behind a personal link (A1); null on the shared link. */
  invitee?: Invitee | null;
  guestToken?: string;
}) {
  const theme = THEMES[invitation.template_id] ?? THEMES["romantic-floral"];
  const target = new Date(`${invitation.event_date}T${invitation.start_time ?? "00:00:00"}`);
  const TopMotif = theme.topMotif;
  const BottomMotif = theme.bottomMotif;
  const startTime = invitation.start_time?.slice(0, 5) ?? null;
  const courses = COURSE_ORDER.map((course) => ({ course, dishes: invitation.menu.filter((d) => d.course === course) })).filter(
    (c) => c.dishes.length > 0,
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: theme.background,
        fontFamily: theme.bodyFont,
        color: theme.textColor,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "36px 20px 0",
        overflow: "hidden",
      }}
    >
      {theme.watercolorWash ? <WatercolorWash color={theme.textColor} /> : null}

      <div style={{ width: "100%", maxWidth: 480, textAlign: "center", position: "relative", zIndex: 1 }}>
        {TopMotif ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <TopMotif color={theme.lineColor} />
            <TopMotif color={theme.lineColor} />
          </div>
        ) : null}

        {photoUrl ? (
          // The arch: a doorway the couple stands in, the page's one flourish.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            style={{
              display: "block",
              width: "min(62vw, 220px)",
              aspectRatio: "3 / 4",
              objectFit: "cover",
              borderRadius: "999px 999px 10px 10px",
              border: `1.5px solid ${theme.lineColor}`,
              padding: 5,
              margin: "4px auto 24px",
            }}
          />
        ) : null}

        {invitee ? (
          <div style={{ margin: "0 0 14px" }}>
            <h1 style={{ color: theme.textColor, fontSize: 21, fontWeight: 500, margin: 0 }}>{invitee.fullName}</h1>
            <p style={{ color: theme.mutedColor, fontSize: 16, margin: "2px 0 0" }}>со радост Ве покануваме</p>
          </div>
        ) : null}

        <p style={{ color: theme.mutedColor, fontSize: 16, fontStyle: "italic", margin: 0 }}>{theme.eyebrow}</p>

        <p
          className={theme.displayFontClass}
          style={{ color: theme.textColor, fontSize: `clamp(34px, 11vw, ${theme.displayFontSize}px)`, margin: "10px 0 14px", lineHeight: 1.1, overflowWrap: "anywhere" }}
        >
          {invitation.couple_names}
        </p>

        <p style={{ fontFamily: theme.numeralFont, fontStyle: "italic", fontSize: 30, margin: 0, color: theme.textColor, fontVariantNumeric: "lining-nums" }}>
          {numericDate(invitation.event_date)}
        </p>
        <p style={{ color: theme.mutedColor, fontSize: 17, margin: "4px 0 0" }}>
          {formatMkWeekday(invitation.event_date)}, {formatMkDate(invitation.event_date)}
          {startTime ? ` во ${startTime} часот` : ""}
        </p>
        <p style={{ color: theme.textColor, fontSize: 18, margin: "10px 0 0" }}>
          {invitation.venue_name}
          {invitation.room_names.length > 0 ? `, ${invitation.room_names.join(", ")}` : ""}
        </p>

        {invitation.message ? (
          <p style={{ color: theme.textColor, fontSize: 18, margin: "22px auto 0", lineHeight: 1.65, maxWidth: "34ch", whiteSpace: "pre-line" }}>
            {invitation.message}
          </p>
        ) : null}

        {BottomMotif ? (
          <div style={{ margin: "26px 0 0", display: "flex", justifyContent: "center" }}>
            <BottomMotif color={theme.lineColor} />
          </div>
        ) : null}

        <CountdownTimer target={target} color={theme.textColor} fontFamily={theme.numeralFont} />

        {invitation.agenda.length > 0 ? (
          <Section title="Програма" theme={theme}>
            <ol aria-label="Програма" style={{ listStyle: "none", margin: "0 auto", padding: 0, maxWidth: 340, textAlign: "left" }}>
              {invitation.agenda.map((item, i) => (
                <li
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 14, padding: "0 0 14px", position: "relative" }}
                >
                  <span style={{ fontFamily: theme.numeralFont, fontStyle: "italic", fontSize: 19, textAlign: "right", color: theme.textColor }}>
                    {item.time ?? ""}
                  </span>
                  <span style={{ fontSize: 18, borderLeft: `1px solid ${theme.lineColor}`, paddingLeft: 14, lineHeight: 1.4 }}>{item.title}</span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {invitation.locations.length > 0 ? (
          <section aria-label="Локации" style={{ margin: "36px 0 0" }}>
            <h2 className={theme.displayFontClass} style={{ color: theme.textColor, fontSize: 30, fontWeight: 400, margin: "0 0 14px" }}>
              Локации
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {invitation.locations.map((location, i) => {
                const href = mapsHref(location);
                const body = (
                  <>
                    <span style={{ display: "block", fontSize: 19, color: theme.textColor }}>{location.label}</span>
                    {location.address ? <span style={{ display: "block", fontSize: 16, color: theme.mutedColor }}>{location.address}</span> : null}
                    {href ? <span style={{ display: "block", fontSize: 15, color: theme.textColor, textDecoration: "underline", marginTop: 2 }}>Отвори мапа</span> : null}
                  </>
                );
                return (
                  <li key={i}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "6px 0", textDecoration: "none" }}>
                        {body}
                      </a>
                    ) : (
                      <div style={{ padding: "6px 0" }}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {courses.length > 0 ? (
          <section aria-label="Мени" style={{ margin: "36px 0 0" }}>
            <h2 className={theme.displayFontClass} style={{ color: theme.textColor, fontSize: 30, fontWeight: 400, margin: "0 0 14px" }}>
              Мени
            </h2>
            {courses.map(({ course, dishes }) => (
              <div key={course} style={{ margin: "0 0 14px" }}>
                <h3 style={{ fontSize: 15, fontStyle: "italic", fontWeight: 500, color: theme.mutedColor, margin: "0 0 4px" }}>{COURSE_LABELS[course]}</h3>
                <p style={{ fontSize: 18, margin: 0, lineHeight: 1.6 }}>
                  {dishes.map((d, i) => (
                    <span key={i} style={{ display: "block" }}>
                      {d.name}
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        <div
          style={{
            background: theme.cardBg,
            borderRadius: 18,
            padding: "22px 20px 24px",
            margin: "36px 0 40px",
            textAlign: "left",
            border: `1px solid ${theme.lineColor}`,
          }}
        >
          <RsvpForm
            slug={slug}
            accentColor={theme.rsvpAccent}
            titleClassName={theme.displayFontClass}
            coupleNames={invitation.couple_names}
            venueName={invitation.venue_name}
            invitee={invitee}
            guestToken={guestToken}
          />
        </div>
      </div>

      {theme.bottomStripe ? <div style={{ width: "100%", height: 28, background: theme.bottomStripe, opacity: 0.9, position: "relative", zIndex: 1 }} /> : null}
    </main>
  );
}
