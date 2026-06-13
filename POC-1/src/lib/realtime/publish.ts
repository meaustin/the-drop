import "server-only";
import { requireServerEnv } from "@/lib/env";
import { venueChannel } from "./channel";

// Server → all devices fan-out. Uses Supabase Realtime's HTTP broadcast endpoint with the
// service key, so a Route Handler (no persistent socket) can push "the shared beat" to every
// present client and the house screen at once.
export async function publishToVenue(
  venueId: string,
  event: string,
  payload: unknown
): Promise<void> {
  const { url, serviceKey } = requireServerEnv();
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: [{ topic: venueChannel(venueId), event, payload }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Realtime broadcast failed (${res.status}): ${body}`);
  }
}
