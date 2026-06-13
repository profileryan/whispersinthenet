import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabaseServer";
import { isTraceFaded, isTraceReply, normalizeTrace } from "@/lib/traces";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, demo: true, error: "Supabase is not configured yet. Replies are unavailable in demo mode." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a reply submission form." }, { status: 400 });
  }

  const rootTraceId = String(formData.get("rootTraceId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const durationSeconds = Number(formData.get("durationSeconds") ?? 0);
  const audio = formData.get("audio");

  if (!rootTraceId || !displayName || displayName.length > 80) {
    return NextResponse.json({ ok: false, error: "Missing reply details." }, { status: 400 });
  }

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ ok: false, error: "Missing audio recording." }, { status: 400 });
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 61 || audio.size > 10 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Recording is too large or too long." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: rootRow, error: rootError } = await supabase
    .from("traces")
    .select("*")
    .eq("id", rootTraceId)
    .eq("status", "approved")
    .single();

  if (rootError || !rootRow) {
    return NextResponse.json({ ok: false, error: "Trace not found." }, { status: 404 });
  }

  const rootTrace = normalizeTrace(rootRow);
  const createdAt = new Date();
  if (isTraceReply(rootTrace)) {
    return NextResponse.json({ ok: false, error: "Replies attach to the original trace." }, { status: 400 });
  }

  if (isTraceFaded(rootTrace, createdAt)) {
    return NextResponse.json({ ok: false, error: "This trace has already faded." }, { status: 410 });
  }

  const replyId = crypto.randomUUID();
  const extension = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  const audioFormat = extension === "webm" && audio.type.includes("opus") ? "webm-opus" : extension;
  const audioPath = `replies/${rootTrace.id}/${replyId}.${extension}`;
  const bucket = process.env.TRACE_AUDIO_BUCKET || "trace-audio";

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(audioPath, audio, { contentType: audio.type || "audio/webm", upsert: false });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("traces").insert({
    id: replyId,
    parent_trace_id: rootTrace.id,
    root_trace_id: rootTrace.id,
    display_name: displayName,
    category: rootTrace.category,
    theme: rootTrace.theme,
    prompt: rootTrace.prompt,
    latitude: rootTrace.latitude,
    longitude: rootTrace.longitude,
    location_label: rootTrace.locationLabel,
    audio_path: audioPath,
    mime_type: audio.type || "audio/webm",
    file_size_bytes: audio.size,
    audio_format: audioFormat,
    duration_seconds: Math.round(durationSeconds),
    retention_quantity: rootTrace.retentionQuantity,
    retention_unit: rootTrace.retentionUnit,
    expires_at: rootTrace.expiresAt,
    status: "approved",
    created_at: createdAt.toISOString(),
  });

  if (insertError) {
    await supabase.storage.from(bucket).remove([audioPath]);
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, traceId: replyId, rootTraceId: rootTrace.id });
}
