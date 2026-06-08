import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, isAdminRequest, isSupabaseConfigured } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  const { status } = (await request.json()) as { status?: "approved" | "rejected" };
  if (!["approved", "rejected"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  if (status === "rejected") {
    const { data: trace, error: lookupError } = await supabase
      .from("traces")
      .select("id,audio_path")
      .eq("id", id)
      .single();

    if (lookupError || !trace) {
      return NextResponse.json({ error: lookupError?.message ?? "Trace not found." }, { status: 404 });
    }

    if (trace.audio_path) {
      const bucket = process.env.TRACE_AUDIO_BUCKET || "trace-audio";
      const { error: removeAudioError } = await supabase.storage.from(bucket).remove([trace.audio_path]);
      if (removeAudioError) {
        return NextResponse.json({ error: removeAudioError.message }, { status: 500 });
      }
    }

    const { error: deleteError } = await supabase.from("traces").delete().eq("id", id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true, id });
  }

  const { data, error } = await supabase
    .from("traces")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.email,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trace: data });
}
