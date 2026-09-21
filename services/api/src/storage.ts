import { admin } from "./supabase.js";

// Private Supabase Storage for generated documents (worksheet PDFs). Only the API writes here;
// readers get a short-lived signed URL after the API checks who they are.
const BUCKET = "worksheets";

export async function putWorksheetPdf(path: string, pdf: Buffer) {
  const { error } = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error("worksheet upload failed: " + error.message);
  return path;
}

export async function signedWorksheetUrl(path: string, seconds = 3600) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, seconds, { download: true });
  if (error || !data) throw new Error("could not sign worksheet url: " + error?.message);
  return data.signedUrl;
}
