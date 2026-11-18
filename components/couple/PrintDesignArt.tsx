import type { ReactNode } from "react";
import { WeddingElegant, WeddingForever, WeddingRomantic } from "./print-art/wedding";
import { BirthdayBalloons } from "./print-art/birthday";
import { BabyShower, BaptismDove, BaptismGold } from "./print-art/kids";
import { GraduationBurgundy, GraduationForest, GraduationNavy } from "./print-art/graduation";
import { AnniversaryBlush, AnniversaryBurgundy, AnniversarySilver, FamilyGarden, FamilySunny, FamilyWarm, NewYearFestive, NewYearMidnight, NewYearSilver } from "./print-art/celebrations";
import { SchoolBooks, SchoolChalkboard, SchoolPencils } from "./print-art/school";
import { BusinessGraphite, BusinessNavy, BusinessTeal, OtherElegant } from "./print-art/business";

// Background artwork for the printable album QR cards. Every design is drawn
// on a 105 x 148 canvas (an A6 card; the A4 poster has the same proportions,
// so it simply scales) and sits behind the card's text and QR code.

const ART: Record<string, () => ReactNode> = {
  "wedding-elegant": () => <WeddingElegant />,
  "wedding-forever": () => <WeddingForever />,
  "wedding-romantic": () => <WeddingRomantic />,
  "birthday-neutral": () => <BirthdayBalloons palette="neutral" elegant />,
  "birthday-pink": () => <BirthdayBalloons palette="pink" />,
  "birthday-blue": () => <BirthdayBalloons palette="blue" />,
  "babyshower-neutral": () => <BabyShower tone="neutral" />,
  "babyshower-pink": () => <BabyShower tone="pink" />,
  "babyshower-blue": () => <BabyShower tone="blue" />,
  "baptism-gold": () => <BaptismGold />,
  "baptism-blue": () => <BaptismDove tone="blue" />,
  "baptism-pink": () => <BaptismDove tone="pink" />,
  "graduation-navy": () => <GraduationNavy />,
  "graduation-forest": () => <GraduationForest />,
  "graduation-burgundy": () => <GraduationBurgundy />,
  "anniversary-gold": () => <AnniversaryBurgundy />,
  "anniversary-silver": () => <AnniversarySilver />,
  "anniversary-blush": () => <AnniversaryBlush />,
  "family-sunny": () => <FamilySunny />,
  "family-garden": () => <FamilyGarden />,
  "family-warm": () => <FamilyWarm />,
  "newyear-midnight": () => <NewYearMidnight />,
  "newyear-silver": () => <NewYearSilver />,
  "newyear-festive": () => <NewYearFestive />,
  "school-pencils": () => <SchoolPencils />,
  "school-chalkboard": () => <SchoolChalkboard />,
  "school-books": () => <SchoolBooks />,
  "business-navy": () => <BusinessNavy />,
  "business-teal": () => <BusinessTeal />,
  "business-graphite": () => <BusinessGraphite />,
  "other-elegant": () => <OtherElegant />,
};

/** The full-card artwork of a design (nothing for the classic card). */
export function PrintDesignArt({ design }: { design: string }) {
  const art = ART[design];
  if (!art) return null;
  return (
    <svg className="s4-art" viewBox="0 0 105 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {art()}
    </svg>
  );
}
