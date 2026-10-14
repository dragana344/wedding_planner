"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TourStep = {
  href: string;
  title: string;
  body: string;
  /** A real, working shortcut shown right in the bubble — lets a new venue
   * try the feature immediately instead of just reading about it. Optional:
   * not every step needs one. */
  cta?: { label: string; href: string };
};

const STEPS: TourStep[] = [
  {
    href: "/venue/events",
    title: "Настани",
    body: "Тука креирате нов настан за клиент.",
    cta: { label: "+ Креирај настан", href: "/venue/events/new" },
  },
  {
    href: "/venue/tables",
    title: "Распоред на маси",
    body: "Тука додавате простории и типови маси.",
    cta: { label: "+ Додади просторија", href: "/venue/tables?addRoom=1" },
  },
  {
    href: "/venue/menus",
    title: "Мени / Пакети",
    body: "Тука ги градите менијата и пакетите што ги нудите.",
  },
];

export function OnboardingTour() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (searchParams.get("tour") === "1") {
      setStepIndex(0);
      router.replace("/venue");
    }
    // Only ever read the param on mount — router.replace strips it right
    // after, so re-running this on every searchParams change would just
    // re-trigger the tour in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stepIndex === null) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${STEPS[stepIndex].href}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [stepIndex]);

  if (stepIndex === null) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function end() {
    setStepIndex(null);
  }

  function next() {
    if (isLast) {
      end();
    } else {
      setStepIndex((i) => (i === null ? null : i + 1));
    }
  }

  function followCta(href: string) {
    end();
    router.push(href);
  }

  return (
    <div className="tour-layer">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ) : null}
      <div
        className="tour-bubble"
        style={
          rect
            ? { top: rect.bottom + 12, left: rect.left }
            : { top: 24, left: 24 }
        }
      >
        <div className="tour-bubble-title">{step.title}</div>
        <p className="tour-bubble-body">{step.body}</p>
        {step.cta ? (
          <button type="button" className="tour-cta" onClick={() => followCta(step.cta!.href)}>
            {step.cta.label}
          </button>
        ) : null}
        <div className="tour-bubble-actions">
          <button type="button" className="tour-skip" onClick={end}>
            Прескокни
          </button>
          <button type="button" className="tour-next" onClick={next}>
            {isLast ? "Заврши" : "Следно"}
          </button>
        </div>
      </div>
    </div>
  );
}
