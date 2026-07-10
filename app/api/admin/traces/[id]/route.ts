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
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid trace id." }, { status: 400 });
  }

  const { status } = (await request.json()) as { status?: "approved" | "rejected" };
  if (!["approved", "rejected"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  if (status === "rejected") {
    const { data: traces, error: lookupError } = await supabase
      .from("traces")
      .select("id,audio_path")
      .or(`id.eq.${id},root_trace_id.eq.${id}`);

    if (lookupError || !traces?.length) {
      return NextResponse.json({ error: lookupError?.message ?? "Trace not found." }, { status: 404 });
    }

    const audioPaths = traces.map((trace) => trace.audio_path).filter((path): path is string => Boolean(path));
    if (audioPaths.length) {
      const bucket = process.env.TRACE_AUDIO_BUCKET || "trace-audio";
      const { error: removeAudioError } = await supabase.storage.from(bucket).remove(audioPaths);
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
