// The wedding book (group A task 7): the couple's whole event as a PDF they
// keep after the data is erased — a keepsake in the couple pages' ivory and
// gold, not a backup dump. Built with @react-pdf/renderer on the server; the
// fonts are embedded TTFs (assets/fonts, SIL OFL) because the PDF standard
// fonts have no Cyrillic. Every section appears only when it has content.
import path from "path";
import { Document, Font, Image, Link, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatMkDate, formatMkDateWithWeekday, formatVenueDatePadded } from "@/lib/date";
import { formatDen } from "@/lib/money";
import { COURSE_LABELS, COURSE_ORDER } from "@/lib/couple/invitation-program";
import { getInvitationTemplate } from "@/lib/couple/invitation-templates";
import { SIDE_LABELS, STATUS_LABELS } from "@/lib/couple/guest-labels";
import type { KeepsakeData } from "./types";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const SERIF = "Cormorant Garamond";
const SANS = "Montserrat";

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: SERIF,
    fonts: [
      { src: path.join(FONT_DIR, "CormorantGaramond-Regular.ttf") },
      { src: path.join(FONT_DIR, "CormorantGaramond-Italic.ttf"), fontStyle: "italic" },
      { src: path.join(FONT_DIR, "CormorantGaramond-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "CormorantGaramond-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: SANS,
    fonts: [
      { src: path.join(FONT_DIR, "Montserrat-Regular.ttf") },
      { src: path.join(FONT_DIR, "Montserrat-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Montserrat-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  // The default splits English syllables; Macedonian words are kept whole.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

// The couple pages' palette (components/seating/couple-seating.css).
const C = {
  paper: "#FBF7EE",
  card: "#FFFDF8",
  tint: "#FAF3E2",
  gold: "#C9A24A",
  goldDark: "#A8822F",
  ink: "#2E2617",
  muted: "#8A7D64",
  line: "#EADDBF",
};

/**
 * The invitation's paper and ink per template, flattened for print from
 * components/invite/FullInvitation.tsx THEMES (gradients become their first
 * colour; the motifs and script faces stay on the web page).
 */
const INVITATION_PRINT: Record<string, { eyebrow: string; paper: string; ink: string; muted: string; line: string }> = {
  "romantic-floral": { eyebrow: "Со љубов Ве покануваме", paper: "#FBF1EF", ink: "#7A3B42", muted: "#8E545B", line: "#D9A5AB" },
  "elegant-gold": { eyebrow: "Со чест Ве покануваме", paper: "#F5EFE4", ink: "#3A2E1F", muted: "#6E5E45", line: "#B8913A" },
  "classic-minimal": { eyebrow: "Ве покануваме", paper: "#FAFAF9", ink: "#2C2C2C", muted: "#5E5E5E", line: "#BDBDBD" },
  "modern-watercolor": { eyebrow: "Ве покануваме", paper: "#F4F9FD", ink: "#2F5578", muted: "#4F7397", line: "#9FBFDD" },
  rustic: { eyebrow: "Ве покануваме со радост", paper: "#EFE2CB", ink: "#5C3E20", muted: "#6E4E2F", line: "#A07A52" },
  "royal-green": { eyebrow: "Со голема радост Ве покануваме", paper: "#4F5D3A", ink: "#F3EEDF", muted: "#E4DDC8", line: "#C9BC94" },
};

const s = StyleSheet.create({
  page: { backgroundColor: C.paper, color: C.ink, fontFamily: SANS, fontSize: 9.5, paddingTop: 64, paddingBottom: 70, paddingHorizontal: 62 },
  frame: { position: "absolute", top: 24, left: 24, right: 24, bottom: 24, borderWidth: 0.75, borderColor: C.line },
  frameInner: { position: "absolute", top: 28, left: 28, right: 28, bottom: 28, borderWidth: 0.4, borderColor: C.line },
  footer: { position: "absolute", bottom: 38, left: 0, right: 0, textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontSize: 10, color: C.muted },
  eyebrow: { fontSize: 7.5, fontWeight: 600, letterSpacing: 2.2, color: C.goldDark, textAlign: "center", textTransform: "uppercase" },
  h1: { fontFamily: SERIF, fontSize: 28, textAlign: "center", color: C.ink, marginTop: 6 },
  h2: { fontFamily: SERIF, fontSize: 18, color: C.ink, marginTop: 14, marginBottom: 6 },
  muted: { color: C.muted },
  small: { fontSize: 8, color: C.muted },
  card: { backgroundColor: C.card, borderWidth: 0.75, borderColor: C.line, borderRadius: 6, padding: 14 },
  row: { flexDirection: "row" },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 1.2, color: C.goldDark, textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: C.line },
});

function Ornament({ width = 150 }: { width?: number }) {
  const mid = width / 2;
  return (
    <View style={{ alignItems: "center", marginVertical: 10 }}>
      <Svg width={width} height={10}>
        <Path d={`M0 5 L${mid - 9} 5`} stroke={C.gold} strokeWidth={0.6} />
        <Path d={`M${mid + 9} 5 L${width} 5`} stroke={C.gold} strokeWidth={0.6} />
        <Path d={`M${mid} 1 L${mid + 4} 5 L${mid} 9 L${mid - 4} 5 Z`} fill={C.gold} />
      </Svg>
    </View>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.h1}>{title}</Text>
      <Ornament />
    </View>
  );
}

/**
 * An A4 page (or several, when the content runs on) with the double gold
 * frame and the footer. `names` is passed down rather than read from context:
 * route handlers render this as a server module, where createContext is not
 * available.
 */
function BookPage({ names, children }: { names: string; children: React.ReactNode }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.frame} fixed />
      <View style={s.frameInner} fixed />
      {children}
      <Text style={s.footer} fixed render={({ pageNumber }) => (pageNumber > 1 ? `${names} · ${pageNumber}` : "")} />
    </Page>
  );
}

/** A section: starts on a new page. */
function Section({ names, eyebrow, title, children }: { names: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <BookPage names={names}>
      <SectionHead eyebrow={eyebrow} title={title} />
      {children}
    </BookPage>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderWidth: 0.75, borderColor: C.line, borderRadius: 6, backgroundColor: C.card }}>
      <Text style={{ fontFamily: SERIF, fontSize: 24, color: C.ink }}>{value}</Text>
      <Text style={[s.small, { marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

function hhmm(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

function Cover({ data, title }: { data: KeepsakeData; title: string }) {
  const start = hhmm(data.startTime);
  const end = hhmm(data.endTime);
  return (
    <View style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingBottom: 30 }}>
      <Text style={[s.eyebrow, { fontSize: 9, letterSpacing: 3.5 }]}>{title}</Text>
      <Ornament width={220} />
      <Text style={{ fontFamily: SERIF, fontSize: 46, lineHeight: 1.15, textAlign: "center", color: C.ink, marginVertical: 8 }}>{data.coupleNames}</Text>
      <Ornament width={220} />
      <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, color: C.ink, marginTop: 6 }}>{formatMkDateWithWeekday(data.eventDate)}</Text>
      {start ? (
        <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: C.muted, marginTop: 2 }}>
          {end ? `од ${start} до ${end} часот` : `во ${start} часот`}
        </Text>
      ) : null}
      {data.venueName ? (
        <Text style={{ fontSize: 10, letterSpacing: 1, color: C.goldDark, marginTop: 22, textAlign: "center" }}>
          {data.venueName}
          {data.roomNames.length > 0 ? ` · ${data.roomNames.join(", ")}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

function InvitationSection({ data }: { data: KeepsakeData }) {
  const invitation = data.invitation!;
  const theme = INVITATION_PRINT[invitation.templateId] ?? INVITATION_PRINT["elegant-gold"];
  const start = hhmm(data.startTime);
  const [y, m, d] = data.eventDate.split("-");
  return (
    <Section names={data.coupleNames} eyebrow="Нашата покана" title="Покана">
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 360, backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.line, borderRadius: 10, paddingVertical: 30, paddingHorizontal: 34, alignItems: "center" }}>
          {invitation.photo ? (
            <View style={{ padding: 4, borderWidth: 1, borderColor: theme.line, borderTopLeftRadius: 90, borderTopRightRadius: 90, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, marginBottom: 18 }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an HTML <img> */}
              <Image
                src={{ data: invitation.photo.data, format: invitation.photo.format }}
                style={{ width: 150, height: 200, objectFit: "cover", borderTopLeftRadius: 86, borderTopRightRadius: 86, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }}
              />
            </View>
          ) : null}
          <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: theme.muted }}>{theme.eyebrow}</Text>
          <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 34, lineHeight: 1.15, color: theme.ink, textAlign: "center", marginVertical: 8 }}>
            {data.coupleNames}
          </Text>
          <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 22, color: theme.ink }}>{`${d}.${m}.${y}`}</Text>
          <Text style={{ fontFamily: SERIF, fontSize: 13, color: theme.muted, marginTop: 2 }}>
            {formatMkDateWithWeekday(data.eventDate)}
            {start ? ` во ${start} часот` : ""}
          </Text>
          {data.venueName ? (
            <Text style={{ fontFamily: SERIF, fontSize: 14, color: theme.ink, marginTop: 8, textAlign: "center" }}>
              {data.venueName}
              {data.roomNames.length > 0 ? `, ${data.roomNames.join(", ")}` : ""}
            </Text>
          ) : null}
          {invitation.message ? (
            <Text style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.55, color: theme.ink, textAlign: "center", marginTop: 16 }}>{invitation.message}</Text>
          ) : null}
        </View>
        <Text style={[s.small, { marginTop: 10 }]}>Шаблон „{getInvitationTemplate(invitation.templateId).name}“</Text>
      </View>
    </Section>
  );
}

function ProgramSection({ data }: { data: KeepsakeData }) {
  return (
    <Section names={data.coupleNames} eyebrow="Денот" title={data.agenda.length > 0 ? "Програма на денот" : "Локации"}>
      {data.agenda.map((item, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: 8 }}>
          <Text style={{ width: 62, textAlign: "right", paddingRight: 12, fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: C.goldDark }}>{item.time ?? ""}</Text>
          <View style={{ flex: 1, borderLeftWidth: 0.75, borderLeftColor: C.gold, paddingLeft: 12, paddingBottom: 2 }}>
            <Text style={{ fontWeight: 600, fontSize: 10.5 }}>{item.title}</Text>
            {item.location ? <Text style={s.muted}>{item.location}</Text> : null}
            {item.notes ? <Text style={[s.small, { marginTop: 1 }]}>{item.notes}</Text> : null}
          </View>
        </View>
      ))}
      {data.locations.length > 0 ? (
        <View style={{ marginTop: data.agenda.length > 0 ? 18 : 0 }}>
          {data.agenda.length > 0 ? <Text style={[s.h2, { textAlign: "center" }]}>Локации</Text> : null}
          {data.locations.map((l, i) => (
            <View key={i} wrap={false} style={[s.card, { marginBottom: 8 }]}>
              <Text style={{ fontFamily: SERIF, fontSize: 15 }}>{l.label}</Text>
              {l.address ? <Text style={s.muted}>{l.address}</Text> : null}
              {l.mapUrl ? (
                <Link src={l.mapUrl} style={{ fontSize: 8, color: C.goldDark, marginTop: 2 }}>
                  Отвори мапа
                </Link>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Section>
  );
}

function GuestsSection({ data }: { data: KeepsakeData }) {
  return (
    <Section names={data.coupleNames} eyebrow="Со нас беа" title="Гости">
      <View style={[s.row, { gap: 10, marginBottom: 18 }]}>
        <Stat value={String(data.attending.people)} label="гости присутни" />
        {data.attending.children > 0 ? <Stat value={String(data.attending.children)} label="од кои деца" /> : null}
        <Stat value={String(data.attending.parties)} label="потврдени покани" />
      </View>
      <View style={[s.tr, { borderBottomColor: C.gold }]}>
        <Text style={[s.th, { width: "31%" }]}>Гостин</Text>
        <Text style={[s.th, { width: "15%" }]}>Страна</Text>
        <Text style={[s.th, { width: "17%" }]}>Одговор</Text>
        <Text style={[s.th, { width: "9%", textAlign: "right" }]}>Лица</Text>
        <Text style={[s.th, { width: "28%", paddingLeft: 10 }]}>Мени</Text>
      </View>
      {data.guests.map((g, i) => (
        <View key={i} style={s.tr} wrap={false}>
          <View style={{ width: "31%" }}>
            <Text style={{ fontWeight: 500 }}>{g.fullName}</Text>
            {g.householdNames && g.householdNames.length > 0 ? <Text style={s.small}>Со: {g.householdNames.join(", ")}</Text> : null}
            {g.allergies ? <Text style={s.small}>Алергии: {g.allergies}</Text> : null}
            {g.comment ? <Text style={[s.small, { fontStyle: "normal" }]}>„{g.comment}“</Text> : null}
          </View>
          <Text style={[s.muted, { width: "15%" }]}>{g.side ? SIDE_LABELS[g.side] : ""}</Text>
          <Text style={{ width: "17%", color: g.status === "confirmed" ? C.goldDark : C.muted }}>{STATUS_LABELS[g.status] ?? g.status}</Text>
          <Text style={{ width: "9%", textAlign: "right" }}>
            {g.partySize}
            {g.childrenCount > 0 ? <Text style={s.small}>{` (${g.childrenCount} д.)`}</Text> : null}
          </Text>
          <Text style={[s.muted, { width: "28%", paddingLeft: 10 }]}>{g.menuText}</Text>
        </View>
      ))}
    </Section>
  );
}

function SeatingSection({ data }: { data: KeepsakeData }) {
  const rooms = [...new Set(data.tables.map((t) => t.room))];
  return (
    <Section names={data.coupleNames} eyebrow="Кој каде седеше" title="Распоред на маси">
      {rooms.map((room) => (
        <View key={room}>
          {rooms.length > 1 ? <Text style={[s.h2, { textAlign: "center" }]}>{room}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {data.tables
              .filter((t) => t.room === room)
              .map((t, i) => (
                <View key={i} wrap={false} style={[s.card, { width: "48.5%", marginBottom: 10 }]}>
                  <View style={[s.row, { justifyContent: "space-between", alignItems: "baseline", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 4, marginBottom: 5 }]}>
                    <Text style={{ fontFamily: SERIF, fontSize: 16 }}>{t.title}</Text>
                    <Text style={s.small}>
                      {t.seats.length} / {t.capacity} места
                    </Text>
                  </View>
                  {t.seats.map((seat) => (
                    <View key={seat.number} style={s.row}>
                      <Text style={{ width: 18, color: C.gold, fontSize: 8.5 }}>{seat.number}</Text>
                      <Text style={{ flex: 1, fontSize: 9 }}>{seat.name}</Text>
                    </View>
                  ))}
                </View>
              ))}
          </View>
        </View>
      ))}
    </Section>
  );
}

function GreetingsSection({ data }: { data: KeepsakeData }) {
  const videos = data.greetings.filter((g) => g.hasVideo).length;
  return (
    <Section names={data.coupleNames} eyebrow="Зборови од срце" title="Честитки">
      {videos > 0 ? (
        <Text style={[s.small, { textAlign: "center", marginTop: -6, marginBottom: 12 }]}>
          {videos === 1 ? "Една честитка има и видео" : `${videos} честитки имаат и видео`} — во папката „Видео честитки“ од преземените фотографии.
        </Text>
      ) : null}
      {data.greetings.map((g, i) => (
        <View key={i} wrap={g.message.length > 1500} style={[s.card, { marginBottom: 10, paddingHorizontal: 20 }]}>
          <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.45, color: C.ink }}>„{g.message}“</Text>
          <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }]}>
            <Text style={{ fontWeight: 600, color: C.goldDark }}>— {g.name}</Text>
            <Text style={s.small}>
              {g.hasVideo ? "со видео · " : ""}
              {formatVenueDatePadded(g.createdAt)}
            </Text>
          </View>
        </View>
      ))}
    </Section>
  );
}

function MenusSection({ data }: { data: KeepsakeData }) {
  return (
    <Section names={data.coupleNames} eyebrow="На трпезата" title="Мени и конечни бројки">
      {data.menus.map((menu, i) => {
        const courses = COURSE_ORDER.map((course) => ({ course, dishes: menu.dishes.filter((d) => d.course === course) })).filter((c) => c.dishes.length > 0);
        return (
          <View key={i} wrap={false} style={[s.card, { marginBottom: 10, alignItems: "center" }]}>
            <Text style={{ fontFamily: SERIF, fontSize: 19 }}>{menu.name}</Text>
            <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: C.goldDark }}>{menu.count === 1 ? "1 гостин" : `${menu.count} гости`}</Text>
            {courses.map(({ course, dishes }) => (
              <View key={course} style={{ alignItems: "center", marginTop: 6 }}>
                <Text style={[s.th, { fontSize: 6.5 }]}>{COURSE_LABELS[course]}</Text>
                {dishes.map((d, j) => (
                  <Text key={j} style={{ fontFamily: SERIF, fontSize: 12.5 }}>
                    {d.name}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      })}
      <View style={{ alignItems: "center", marginTop: 8 }}>
        <Text style={{ fontFamily: SERIF, fontSize: 15 }}>
          Вкупно присутни: {data.attending.people}
          {data.attending.children > 0 ? ` (од кои деца: ${data.attending.children})` : ""}
        </Text>
        {(data.noMeal ?? 0) > 0 ? <Text style={s.small}>Деца без оброк: {data.noMeal}</Text> : null}
        {data.numbersSentAt ? (
          <Text style={s.small}>
            Конечните бројки се испратени до салата на {formatVenueDatePadded(data.numbersSentAt)}
            {data.numbersSent ? `: ${data.numbersSent.people} лица${data.numbersSent.estimated > 0 ? ` (од кои проценка: ${data.numbersSent.estimated})` : ""}` : ""}.
          </Text>
        ) : null}
      </View>
    </Section>
  );
}

function money(amount: number | null): string {
  return amount === null ? "—" : formatDen(amount);
}

function BudgetSection({ data }: { data: KeepsakeData }) {
  const { budget } = data;
  const hasVenue = budget.venue.estimated !== null || budget.venue.paid !== null;
  return (
    <Section names={data.coupleNames} eyebrow="Трошоци" title="Буџет">
      <View style={[s.row, { gap: 10, marginBottom: 18 }]}>
        <Stat value={formatDen(budget.totalEstimated)} label="планирано" />
        <Stat value={formatDen(budget.totalPaid)} label="платено" />
        <Stat value={formatDen(budget.totalEstimated - budget.totalPaid)} label="преостанато" />
      </View>
      <View style={[s.tr, { borderBottomColor: C.gold }]}>
        <Text style={[s.th, { width: "42%" }]}>Ставка</Text>
        <Text style={[s.th, { width: "17%", textAlign: "right" }]}>Планирано</Text>
        <Text style={[s.th, { width: "17%", textAlign: "right" }]}>Платено</Text>
        <Text style={[s.th, { width: "24%", paddingLeft: 12 }]}>Плаќање</Text>
      </View>
      {hasVenue ? (
        <View style={s.tr} wrap={false}>
          <Text style={{ width: "42%", fontWeight: 500 }}>Локал</Text>
          <Text style={{ width: "17%", textAlign: "right" }}>{money(budget.venue.estimated)}</Text>
          <Text style={{ width: "17%", textAlign: "right" }}>{money(budget.venue.paid)}</Text>
          <Text style={{ width: "24%", paddingLeft: 12 }} />
        </View>
      ) : null}
      {budget.items.map((item, i) => (
        <View key={i} style={s.tr} wrap={false}>
          <View style={{ width: "42%" }}>
            <Text style={{ fontWeight: 500 }}>{item.name}</Text>
            <Text style={s.small}>{item.category}</Text>
            {item.notes ? <Text style={s.small}>{item.notes}</Text> : null}
          </View>
          <Text style={{ width: "17%", textAlign: "right" }}>{money(item.estimated)}</Text>
          <Text style={{ width: "17%", textAlign: "right" }}>{formatDen(item.paid)}</Text>
          <Text style={[s.muted, { width: "24%", paddingLeft: 12, fontSize: 8.5 }]}>
            {[item.paidBy, item.paymentDate ? formatMkDate(item.paymentDate) : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ))}
      <View style={[s.row, { paddingVertical: 6 }]}>
        <Text style={{ width: "42%", fontFamily: SERIF, fontSize: 14 }}>Вкупно</Text>
        <Text style={{ width: "17%", textAlign: "right", fontWeight: 600 }}>{formatDen(budget.totalEstimated)}</Text>
        <Text style={{ width: "17%", textAlign: "right", fontWeight: 600 }}>{formatDen(budget.totalPaid)}</Text>
        <Text style={{ width: "24%" }} />
      </View>
    </Section>
  );
}

function Box({ done }: { done: boolean }) {
  return (
    <View style={{ width: 9, height: 9, marginTop: 2, marginRight: 8, borderWidth: 0.75, borderColor: C.gold, borderRadius: 2, backgroundColor: done ? C.gold : "transparent" }} />
  );
}

function ChecklistSection({ data }: { data: KeepsakeData }) {
  const done = data.checklist.filter((c) => c.done).length;
  return (
    <Section names={data.coupleNames} eyebrow="Подготовки" title="Чеклиста">
      <Text style={[s.small, { textAlign: "center", marginTop: -6, marginBottom: 12 }]}>
        Завршени {done} од {data.checklist.length} задачи
      </Text>
      {data.checklist.map((item, i) => (
        <View key={i} wrap={false} style={{ paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
          <View style={s.row}>
            <Box done={item.done} />
            <Text style={{ flex: 1, color: item.done ? C.muted : C.ink }}>{item.title}</Text>
            {item.dueDate ? <Text style={s.small}>{formatMkDate(item.dueDate)}</Text> : null}
          </View>
          {item.subtasks.map((sub, j) => (
            <View key={j} style={[s.row, { marginLeft: 17, marginTop: 2 }]}>
              <Box done={sub.done} />
              <Text style={{ flex: 1, fontSize: 8.5, color: C.muted }}>{sub.title}</Text>
            </View>
          ))}
        </View>
      ))}
    </Section>
  );
}

function NotesSection({ data }: { data: KeepsakeData }) {
  return (
    <Section names={data.coupleNames} eyebrow="Запишано" title="Белешки">
      {data.notes.map((note, i) => (
        <View key={i} style={{ marginBottom: 14 }} wrap={note.content.length > 1500}>
          <Text style={{ fontFamily: SERIF, fontSize: 16 }}>{note.title}</Text>
          <Text style={[s.small, { marginBottom: 3 }]}>{formatVenueDatePadded(note.updatedAt)}</Text>
          {note.content ? <Text style={{ lineHeight: 1.5 }}>{note.content}</Text> : null}
        </View>
      ))}
    </Section>
  );
}

/** The book's title: "Свадбена книга" for a wedding. */
export function bookTitle(data: Pick<KeepsakeData, "isWedding">): string {
  return data.isWedding ? "Свадбена книга" : "Спомен-книга";
}

export function WeddingBook({ data }: { data: KeepsakeData }) {
  const title = bookTitle(data);
  return (
    <Document title={`${title} — ${data.coupleNames}`} author={data.coupleNames} language="mk" creator="Каде си?" producer="Каде си?">
      <BookPage names={data.coupleNames}>
        <Cover data={data} title={title} />
      </BookPage>
      {data.invitation ? <InvitationSection data={data} /> : null}
      {data.agenda.length > 0 || data.locations.length > 0 ? <ProgramSection data={data} /> : null}
      {data.guests.length > 0 ? <GuestsSection data={data} /> : null}
      {data.tables.length > 0 ? <SeatingSection data={data} /> : null}
      {data.greetings.length > 0 ? <GreetingsSection data={data} /> : null}
      {data.menus.length > 0 ? <MenusSection data={data} /> : null}
      {data.budget.items.length > 0 || data.budget.venue.estimated !== null || data.budget.venue.paid !== null ? <BudgetSection data={data} /> : null}
      {data.checklist.length > 0 ? <ChecklistSection data={data} /> : null}
      {data.notes.length > 0 ? <NotesSection data={data} /> : null}
    </Document>
  );
}

/** The book as PDF bytes. */
export async function renderWeddingBook(data: KeepsakeData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<WeddingBook data={data} />);
}
