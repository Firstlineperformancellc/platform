// What counts as a video we take, and the plain-language reasons we turn a file away.
// Shared by the order's film step and the VideoUpload component so both say the same thing.

// Containers a phone, camera, or editor hands people. Browsers leave the mime type blank for
// some of these (mkv, mts), so the extension list is the fallback, not the mime type alone.
export const ACCEPTED_VIDEO: { extensions: readonly string[]; mimeTypes: readonly string[] } = {
  extensions: ["mp4", "mov", "m4v", "webm", "mkv", "avi", "mts", "m2ts", "3gp", "hevc"],
  mimeTypes: ["video/*"],
};

// Mux takes direct uploads past this; the cap is here so a parent hears "too big" from us, in
// words, before the transfer starts rather than from a failure an hour in. Same 1e9 maths as the
// size shown on screen, so a file that reads "20.1 GB" is the one that gets turned away.
export const MAX_VIDEO_BYTES = 20e9;

// Short lines for the upload step. Plain, warm, and only promises what the code does.
export const UPLOAD_TIPS: string[] = [
  "Any video from a phone works.",
  "MP4 or MOV is ideal. Any length.",
  "A full game is usually 1 to 4 GB and takes 5 to 30 minutes on home wifi.",
  "Keep this tab open until the bar reaches 100%. The upload runs in this browser tab.",
  "If the connection drops, it pauses and resumes on its own.",
  "Or paste a YouTube link on the order step instead.",
];

// "game.MOV" -> "mov"; "Game 2 vs. Rangers" -> null (the tail after the dot is not an extension).
function extensionOf(name: string): string | null {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : null;
}

// Why we will not upload this file, in one sentence a parent can act on; null when it is fine.
export function videoFileProblem(name: string, mime: string | null | undefined, sizeBytes: number | null | undefined): string | null {
  const ext = extensionOf(name);
  const isVideo = (mime ?? "").toLowerCase().startsWith("video/") || (ext != null && ACCEPTED_VIDEO.extensions.includes(ext));
  if (!isVideo) {
    const what = ext ? `That's a .${ext}.` : "That doesn't look like a video file.";
    return `${what} Send the game as a video file: MP4 or MOV from a phone works best.`;
  }
  if (sizeBytes != null && sizeBytes > MAX_VIDEO_BYTES) return "That file is over 20 GB; export a smaller version or split the game.";
  return null;
}
