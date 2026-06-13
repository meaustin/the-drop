// Single source of truth for channel naming, so the transport stays swappable (spec §13 escape
// hatch: "keep the realtime layer behind a thin client interface" — a move to Ably/Pusher touches
// only this folder).
export const venueChannel = (venueId: string) => `venue:${venueId}`;

export const RT_EVENT = {
  drop: "drop",
  reveal: "reveal",
  answered: "answered", // a client locked in an answer (drives the live "N locked in" counter)
} as const;
