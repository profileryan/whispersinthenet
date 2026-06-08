import type { Trace } from "@/lib/traces";

export async function getAudioUrl(trace: Trace, token?: string | null) {
  if (trace.audioUrl) {
    return trace.audioUrl;
  }

  if (!trace.audioPath) {
    return null;
  }

  const response = await fetch("/api/audio-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ traceId: trace.id }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { url?: string };
  return data.url ?? null;
}
