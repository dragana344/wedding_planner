"use client";

import "@/app/venue/panel.css";

/** Shared split-screen frame for both standalone login pages (venue staff and
 * couple), matching the panel design system used inside the two dashboards. */
export function AuthScreen({
  eyebrow,
  tagline,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  tagline: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="vp auth-screen">
      <div className="auth-side">
        <svg width="48" height="48" viewBox="0 0 42 42" aria-hidden className="mark">
          <path d="M21 4 34 15.5 21 38 8 15.5 21 4Z" fill="#E0B44E" />
          <path d="M21 4 34 15.5H8L21 4Z" fill="#F2D48A" />
          <path d="M21 38 8 15.5h26L21 38Z" fill="#C9992F" />
          <path d="M21 4 15 15.5 21 38l6-22.5L21 4Z" fill="#F6E3AF" opacity=".55" />
        </svg>
        <div className="auth-brand-name">КАДЕ СУМ?</div>
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
