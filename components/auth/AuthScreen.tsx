"use client";

import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/marketing/BrandLogo";
import { montserrat, nunito } from "@/components/marketing/fonts";
import "@/app/venue/panel.css";
import "@/app/landing.css";

export type AuthTheme = "panel" | "landing";

/** The "other" auth page, offered in the nav and under the card (landing theme only). */
export type AuthSwitch = { prompt: string; label: string; href: string };

/** Shared frame for the standalone auth pages. The "panel" theme is the
 * split screen of the panel design system (admin and couple logins); the
 * "landing" theme wears the marketing page's design, for the venue pages a
 * visitor reaches from it (/login, /signup, /reset-password). */
export function AuthScreen({
  eyebrow,
  tagline,
  title,
  subtitle,
  theme = "panel",
  switchTo,
  children,
}: {
  eyebrow: string;
  tagline: string;
  title: string;
  subtitle?: string;
  theme?: AuthTheme;
  switchTo?: AuthSwitch;
  children: React.ReactNode;
}) {
  if (theme === "landing") {
    return (
      <div className={`lp auth-lp ${montserrat.variable} ${nunito.variable}`}>
        <nav className="nav" aria-label="Главна навигација">
          <div className="wrap nav-row">
            <Link className="brand" href="/" aria-label="Каде си? почетна">
              <LogoMark id="auth-nav-mark" className="brand-mark" />
              <Wordmark id="auth-nav-word" className="brand-word" />
            </Link>
            {switchTo ? (
              <div className="auth-nav-actions">
                <span>{switchTo.prompt}</span>
                <Link href={switchTo.href} className="btn btn-outline btn-sm">
                  {switchTo.label}
                </Link>
              </div>
            ) : null}
          </div>
        </nav>
        <main className="auth-main">
          <div className="wrap auth-grid">
            <div className="auth-intro">
              <LogoMark id="auth-hero-mark" className="hero-mark" />
              <p className="eyebrow">{eyebrow}</p>
              <p className="auth-tagline">{tagline}</p>
            </div>
            <div className="auth-card">
              <h1 className="auth-title">{title}</h1>
              {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
              {children}
              {switchTo ? (
                <p className="auth-switch">
                  {switchTo.prompt} <Link href={switchTo.href}>{switchTo.label}</Link>
                </p>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="vp auth-screen">
      <div className="auth-side">
        <svg width="48" height="48" viewBox="0 0 42 42" aria-hidden className="mark">
          <path d="M21 4 34 15.5 21 38 8 15.5 21 4Z" fill="#E0B44E" />
          <path d="M21 4 34 15.5H8L21 4Z" fill="#F2D48A" />
          <path d="M21 38 8 15.5h26L21 38Z" fill="#C9992F" />
          <path d="M21 4 15 15.5 21 38l6-22.5L21 4Z" fill="#F6E3AF" opacity=".55" />
        </svg>
        <div className="auth-brand-name">КАДЕ СИ?</div>
        <div className="auth-eyebrow">{eyebrow}</div>
        <p className="auth-tagline">{tagline}</p>
      </div>
      <div className="auth-form-side">
        <div className="auth-card panel">
          <h1 className="auth-title">{title}</h1>
          {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
