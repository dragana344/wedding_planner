"use client";

import { useState } from "react";

export function RsvpForm({ slug, accentColor }: { slug: string; accentColor: string }) {
  const [fullName, setFullName] = useState("");
  const [attending, setAttending] = useState<boolean | null>(null);
  const [partySize, setPartySize] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attending === null) {
      setError("Please let us know if you'll be attending.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/invite/${slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          attending,
          party_size: attending ? Number(partySize) || 1 : 1,
        }),
      });
      if (!response.ok) {
        const { error: message } = await response.json();
        setError(message ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border p-6 text-center" style={{ borderColor: accentColor }}>
        <p className="font-medium text-neutral-800">
          {attending ? "Thank you — we've noted you'll be attending!" : "Thank you for letting us know."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-left">
      <p className="text-center font-display text-lg" style={{ color: accentColor }}>
        RSVP
      </p>

      <div>
        <label htmlFor="rsvp-name" className="mb-1 block text-sm text-neutral-600">
          Your full name
        </label>
        <input
          id="rsvp-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <p className="mb-1 block text-sm text-neutral-600">Will you be attending?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAttending(true)}
            aria-pressed={attending === true}
            className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium"
            style={
              attending === true
                ? { background: accentColor, borderColor: accentColor, color: "#fff" }
                : { borderColor: "#d4d4d8", color: "#3f3f46" }
            }
          >
            Yes, I&apos;ll be there
          </button>
          <button
            type="button"
            onClick={() => setAttending(false)}
            aria-pressed={attending === false}
            className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium"
            style={
              attending === false
                ? { background: accentColor, borderColor: accentColor, color: "#fff" }
                : { borderColor: "#d4d4d8", color: "#3f3f46" }
            }
          >
            Can&apos;t make it
          </button>
        </div>
      </div>

      {attending === true ? (
        <div>
          <label htmlFor="rsvp-party-size" className="mb-1 block text-sm text-neutral-600">
            Number of guests (including you)
          </label>
          <input
            id="rsvp-party-size"
            type="number"
            min={1}
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: accentColor }}
      >
        {isSubmitting ? "Sending..." : "Send RSVP"}
      </button>
    </form>
  );
}
