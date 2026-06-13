// Shared types across server and client.

export type QuestionFormat = "multiple_choice" | "closest_guess" | "poll";

/** The drop payload broadcast to every device in a venue — ANSWER STRIPPED. */
export type DropPayload = {
  dropId: string;
  venueId: string;
  format: QuestionFormat;
  prompt: string;
  options: string[] | null; // null for closest_guess
  unit: string | null; // closest_guess display unit
  category: string | null;
  isPrizeDrop: boolean;
  prize: { name: string; description: string | null } | null;
  countdownSeconds: number;
  startedAt: string; // ISO
  closesAt: string; // ISO
};

/** Broadcast at reveal — now the correct answer is public. */
export type RevealPayload = {
  dropId: string;
  format: QuestionFormat;
  correctOption: number | null;
  correctNumber: number | null;
  unit: string | null;
  isPrizeDrop: boolean;
  winner: { handle: string; elapsedMs: number } | null;
  answerCount: number;
  // Per-option tallies for the reveal bar chart (MC/poll).
  tally: number[] | null;
};

export type LeaderboardRow = {
  player_id: string;
  handle: string;
  points: number;
  rank: number;
};

export type RealtimeEvent =
  | { type: "drop"; payload: DropPayload }
  | { type: "reveal"; payload: RevealPayload }
  | { type: "presence"; payload: { count: number } };

export type VenuePublic = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  timezone: string;
  theme: Record<string, unknown>;
  houseScreenEnabled: boolean;
};

export type PrizePublic = { id: string; name: string; description: string | null };
