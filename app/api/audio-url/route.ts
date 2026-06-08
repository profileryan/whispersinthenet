import { NextRequest, NextResponse } from "next/server";
import { resolveSignedUrlTtlSeconds } from "@/lib/traces";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { traceId } = (await request.json()) as { traceId?: string };
  if (!traceId) {
    return NextResponse.json({ error: "Missing trace id." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: trace, error } = await supabase
    .from("traces")
    .select("id,status,audio_path,expires_at")
    .eq("id", traceId)
    .single();

  if (error || !trace?.audio_path) {
    return NextResponse.json({ error: "Trace not found." }, { status: 404 });
  }

  const isApproved = trace.status === "approved";
  if (!isApproved) {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: userResult } = await supabase.auth.getUser(token);
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const email = userResult.user?.email?.toLowerCase();
    if (!email || !adminEmails.includes(email)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const ttlSeconds = resolveSignedUrlTtlSeconds(
    typeof trace.expires_at === "string" ? trace.expires_at : null,
    isApproved,
  );
  if (ttlSeconds <= 0) {
    return NextResponse.json({ error: "Trace audio has faded." }, { status: 410 });
  }

  const bucket = process.env.TRACE_AUDIO_BUCKET || "trace-audio";
  const { data, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(trace.audio_path, ttlSeconds);

  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not create audio URL." }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
