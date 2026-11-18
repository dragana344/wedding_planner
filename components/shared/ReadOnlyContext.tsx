"use client";

import { createContext, useContext } from "react";

/**
 * True when the whole panel is read-only — the couple's "memories" period
 * after the event (group A task 2). Forms check it to hide their add/edit
 * controls; the API refuses the writes either way (withCoupleEvent). False
 * outside a provider, so the venue and admin panels are unaffected.
 */
const ReadOnlyContext = createContext(false);

export const ReadOnlyProvider = ReadOnlyContext.Provider;

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
