import { NextRequest, NextResponse } from "next/server";
import { FLAG_REASON_OPTIONS, isFlagReasonKey, isFlagSubmissionComplete, normalizeFlagDetails } from "@/lib/flagging";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const flagRequest = await readFlagRequest(request);
  const { traceId } = flagRequest;
  if (!isUuid(traceId)) {
    return NextResponse.json({ ok: false, error: "Invalid trace id." }, { status: 400 });
  }

  if (!isFlagSubmissionComplete(flagRequest.reason, flagRequest.details)) {
    return NextResponse.json({ ok: false, error: "Pick a reason or type something before submitting." }, { status: 400 });
  }

  const reason = isFlagReasonKey(flagRequest.reason) ? flagRequest.reason : null;
  const details = normalizeFlagDetails(flagRequest.details);

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, demo: true, error: "Supabase is not configured yet. Flagging is unavailable in demo mode." },
      { status: 503 },
    );
  }

  const supabase = createServerSupabase();
  const { data: trace, error: traceError } = await supabase
    .from("traces")
    .select("id,parent_trace_id,root_trace_id,status")
    .eq("id", traceId)
    .eq("status", "approved")
    .maybeSingle();

  if (traceError) {
    return NextResponse.json({ ok: false, error: traceError.message }, { status: 500 });
  }

  if (!trace) {
    return NextResponse.json({ ok: false, error: "Trace not found." }, { status: 404 });
  }

  const isRootTrace = !trace.parent_trace_id && !trace.root_trace_id;
  const targetFilter = isRootTrace ? `id.eq.${traceId},root_trace_id.eq.${traceId},parent_trace_id.eq.${traceId}` : `id.eq.${traceId}`;

  const flagReportId = await recordFlagReport(supabase, {
    traceId,
    reason,
    details,
    userAgent: request.headers.get("user-agent") ?? "",
  });

  const { data, error } = await supabase
    .from("traces")
    .update({
      status: "pending",
      reviewed_at: null,
      reviewed_by: null,
    })
    .or(targetFilter)
    .eq("status", "approved")
    .select("id");

  if (error) {
    await deleteFlagReport(supabase, flagReportId);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    await deleteFlagReport(supabase, flagReportId);
    return NextResponse.json({ ok: false, error: "Trace not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, traceId, traceIds: data.map((item) => item.id) });
}

async function readFlagRequest(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await request.json()) as { traceId?: unknown; id?: unknown; reason?: unknown; details?: unknown };
      return {
        traceId: String(payload.traceId ?? payload.id ?? "").trim(),
        reason: payload.reason,
        details: payload.details,
      };
    }

    const formData = await request.formData();
    return {
      traceId: String(formData.get("traceId") ?? formData.get("id") ?? "").trim(),
      reason: formData.get("reason"),
      details: formData.get("details"),
    };
  } catch {
    return { traceId: "", reason: "", details: "" };
  }
}

async function recordFlagReport(
  supabase: ReturnType<typeof createServerSupabase>,
  {
    traceId,
    reason,
    details,
    userAgent,
  }: {
    traceId: string;
    reason: string | null;
    details: string;
    userAgent: string;
  },
) {
  const reasonLabel = FLAG_REASON_OPTIONS.find((option) => option.key === reason)?.label.replace("\n", " ") ?? null;
  const { data, error } = await supabase
    .from("trace_flags")
    .insert({
      trace_id: traceId,
      reason,
      reason_label: reasonLabel,
      details: details || null,
      user_agent: userAgent.slice(0, 300) || null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ? String(data.id) : null;
}

async function deleteFlagReport(supabase: ReturnType<typeof createServerSupabase>, flagReportId: string | null) {
  if (!flagReportId) {
    return;
  }

  await supabase.from("trace_flags").delete().eq("id", flagReportId);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
