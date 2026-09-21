import { api } from "./api";
import { supabase } from "./supabase";

export type WorksheetClip = { time: string; situation: string; what_happened: string; improve: string; takeaway: string };
export type WorksheetDrill = { area: string; drill: string; description: string; frequency: string; notes: string };
export type Worksheet = {
  strengths: string[];
  improvements: string[];
  clips: WorksheetClip[];
  drills: WorksheetDrill[];
  next_steps: string[];
  notes: string;
};

export const emptyWorksheet = (): Worksheet => ({
  strengths: ["", "", ""],
  improvements: ["", "", ""],
  clips: [{ time: "", situation: "", what_happened: "", improve: "", takeaway: "" }],
  drills: [{ area: "", drill: "", description: "", frequency: "", notes: "" }],
  next_steps: ["", "", ""],
  notes: "",
});

export type Breakdown = {
  id: string;
  job_id: string;
  worksheet: Worksheet;
  worksheet_pdf_path: string | null;
  media_id: string;
  rating: number | null;
  review: string | null;
  review_status: string;
  delivered_at: string;
  media: { status: string; mux_playback_id: string | null } | null;
};

export async function getBreakdownForJob(jobId: string): Promise<Breakdown | null> {
  const { data } = await supabase
    .from("breakdowns")
    .select("id, job_id, worksheet, worksheet_pdf_path, media_id, rating, review, review_status, delivered_at, media:media_id(status, mux_playback_id)")
    .eq("job_id", jobId)
    .maybeSingle();
  return (data as unknown as Breakdown | null) ?? null;
}

export const deliverBreakdown = (jobId: string, mediaId: string, worksheet: Worksheet) =>
  api<{ ok: true; breakdownId: string; onTime: boolean }>("/breakdowns/deliver", { method: "POST", body: JSON.stringify({ jobId, mediaId, worksheet }) });

export const worksheetPdfUrl = (breakdownId: string) => api<{ url: string }>(`/breakdowns/${breakdownId}/worksheet`);

export const reviewBreakdown = (breakdownId: string, rating: number, review: string) =>
  api<{ ok: true; review_status: string }>(`/breakdowns/${breakdownId}/review`, { method: "POST", body: JSON.stringify({ rating, review }) });

export const fileAudit = (breakdownId: string, reason: string) =>
  api<{ ok: true; auditId: string }>(`/breakdowns/${breakdownId}/audit`, { method: "POST", body: JSON.stringify({ reason }) });

export async function openAuditFor(breakdownId: string) {
  const { data } = await supabase.from("quality_audits").select("id, status, outcome, opened_at").eq("breakdown_id", breakdownId).order("opened_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}
