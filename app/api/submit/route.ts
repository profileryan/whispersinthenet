import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabaseServer";
import { calculateExpiresAt, validateTraceSubmission } from "@/lib/traces";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, demo: true, error: "Supabase is not configured yet. The UI is running in demo mode." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a trace submission form." }, { status: 400 });
  }
  const validation = validateTraceSubmission({
    displayName: formData.get("displayName"),
    category: formData.get("category"),
    theme: formData.get("theme"),
    prompt: formData.get("prompt"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    durationSeconds: formData.get("durationSeconds"),
    retentionQuantity: formData.get("retentionQuantity"),
    retentionUnit: formData.get("retentionUnit"),
  });
  const audio = formData.get("audio");

  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const { displayName, category, theme, prompt, latitude, longitude, durationSeconds, retentionQuantity, retentionUnit } = validation.data;

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ ok: false, error: "Missing audio recording." }, { status: 400 });
  }

  if (audio.size > 10 * 1024 * 1024 || durationSeconds > 61) {
    return NextResponse.json({ ok: false, error: "Recording is too large or too long." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const traceId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = calculateExpiresAt(createdAt, retentionQuantity, retentionUnit);
  const extension = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  const audioFormat = extension === "webm" && audio.type.includes("opus") ? "webm-opus" : extension;
  const audioPath = `pending/${traceId}.${extension}`;
  const bucket = process.env.TRACE_AUDIO_BUCKET || "trace-audio";

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(audioPath, audio, { contentType: audio.type || "audio/webm", upsert: false });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("traces").insert({
    id: traceId,
    display_name: displayName,
    category,
    theme,
    prompt,
    latitude,
    longitude,
    location_label: await getLocationLabel(latitude, longitude),
    audio_path: audioPath,
    mime_type: audio.type || "audio/webm",
    file_size_bytes: audio.size,
    audio_format: audioFormat,
    duration_seconds: Math.round(durationSeconds),
    retention_quantity: retentionQuantity,
    retention_unit: retentionUnit,
    expires_at: expiresAt,
    status: "approved",
    created_at: createdAt.toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, traceId });
}

async function getLocationLabel(latitude: number, longitude: number) {
  const fallback = `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "16",
      addressdetails: "1",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        "User-Agent": "Traces voice map app (https://traces-steel.vercel.app)",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };
    const address = data.address ?? {};
    const area =
      address.neighbourhood ??
      address.suburb ??
      address.quarter ??
      address.city_district ??
      address.town ??
      address.city ??
      address.municipality ??
      address.county;
    const road = address.road ?? address.pedestrian ?? address.footway;
    const country = address.country;
    const primary = road && area ? `${road}, ${area}` : area ?? road;

    if (primary && country) {
      return `${primary}, ${country}`;
    }

    return data.display_name?.split(",").slice(0, 3).join(",").trim() || fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
