import PDFDocument from "pdfkit";

// The Player Development Worksheet: Alex's sample (docs/reference) as structured data, validated
// on delivery and rendered to a branded PDF the youth athlete keeps.

export type Worksheet = {
  strengths: string[];
  improvements: string[];
  clips: { time: string; situation: string; what_happened: string; improve: string; takeaway: string }[];
  drills: { area: string; drill: string; description: string; frequency: string; notes: string }[];
  next_steps: string[];
  notes: string;
};

const clean = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 6) => (Array.isArray(v) ? v.map((x) => clean(x, 300)).filter(Boolean).slice(0, max) : []);

// Returns a normalized worksheet or a human-readable problem. Minimums per Scott (2026-09-21):
// at least one clip row and one drill row.
export function validateWorksheet(input: unknown): { ok: true; worksheet: Worksheet } | { ok: false; error: string } {
  const w = (input ?? {}) as Record<string, unknown>;
  const clips = (Array.isArray(w.clips) ? w.clips : [])
    .map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      return { time: clean(r.time, 20), situation: clean(r.situation, 200), what_happened: clean(r.what_happened), improve: clean(r.improve), takeaway: clean(r.takeaway) };
    })
    .filter((c) => c.situation || c.what_happened || c.improve || c.takeaway)
    .slice(0, 20);
  const drills = (Array.isArray(w.drills) ? w.drills : [])
    .map((d) => {
      const r = (d ?? {}) as Record<string, unknown>;
      return { area: clean(r.area, 120), drill: clean(r.drill, 160), description: clean(r.description), frequency: clean(r.frequency, 80), notes: clean(r.notes, 300) };
    })
    .filter((d) => d.drill || d.description)
    .slice(0, 20);
  const worksheet: Worksheet = {
    strengths: list(w.strengths),
    improvements: list(w.improvements),
    clips,
    drills,
    next_steps: list(w.next_steps),
    notes: clean(w.notes, 2000),
  };
  if (worksheet.strengths.length === 0) return { ok: false, error: "Add at least one strength." };
  if (worksheet.improvements.length === 0) return { ok: false, error: "Add at least one area to improve." };
  if (clips.length === 0) return { ok: false, error: "Add at least one game situation from the film." };
  if (drills.length === 0) return { ok: false, error: "Recommend at least one workout or drill." };
  if (worksheet.next_steps.length === 0) return { ok: false, error: "Give the youth athlete at least one next step." };
  return { ok: true, worksheet };
}

export type WorksheetHeader = {
  playerName: string;
  ageGroup: string;
  position: string;
  mentorName: string;
  mentorLevel: string;
  date: string;
};

const GOLD = "#B8891F";
const INK = "#111111";
const MUTED = "#666666";
const RULE = "#DDDDDD";

export function renderWorksheetPdf(h: WorksheetHeader, w: Worksheet): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 64, bottom: 56, left: 54, right: 54 }, info: { Title: "FLP Player Development Worksheet", Author: "First Line Performance" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    const band = () => {
      doc.save();
      doc.rect(0, 0, doc.page.width, 22).fill(GOLD);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text("FIRST LINE PERFORMANCE", left, 7, { characterSpacing: 1.2 });
      doc.text("PLAYER DEVELOPMENT WORKSHEET", left, 7, { width: pageW, align: "right", characterSpacing: 1.2 });
      doc.restore();
    };
    band();
    doc.on("pageAdded", band);

    const section = (title: string, sub?: string) => {
      ensure(60);
      doc.moveDown(0.8);
      doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(9).text(title.toUpperCase(), { characterSpacing: 1.4 });
      if (sub) doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(sub);
      doc.moveTo(left, doc.y + 3).lineTo(left + pageW, doc.y + 3).strokeColor(RULE).lineWidth(0.6).stroke();
      doc.moveDown(0.5);
      doc.fillColor(INK);
    };
    const ensure = (need: number) => {
      if (doc.y + need > doc.page.height - doc.page.margins.bottom) doc.addPage();
    };
    const bullets = (items: string[]) => {
      doc.font("Helvetica").fontSize(10.5).fillColor(INK);
      for (const it of items) {
        ensure(24);
        doc.text("•  " + it, { indent: 0, paragraphGap: 3 });
      }
    };

    // Title + header block
    doc.moveDown(0.6);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text("Player Development Worksheet");
    doc.moveDown(0.4);
    const colW = pageW / 2;
    const y0 = doc.y;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("YOUTH ATHLETE", left, y0, { characterSpacing: 1 });
    doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(`${h.playerName}   ·   ${h.ageGroup}   ·   ${h.position}`, left, y0 + 13);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("BREAKDOWN BY", left + colW, y0, { characterSpacing: 1 });
    doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(`${h.mentorName}   ·   ${h.mentorLevel}`, left + colW, y0 + 13);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(h.date, left + colW, y0 + 28);
    doc.y = y0 + 44;

    // Two columns: strengths / improvements
    section("Strengths", "What you did well.");
    bullets(w.strengths);
    section("Areas to improve", "Key areas to focus on.");
    bullets(w.improvements);

    // Clips table
    section("Game situations breakdown", "Specific clips and situations analyzed.");
    const cw = [52, 110, 120, 120, pageW - 402];
    const heads = ["Clip / time", "Situation", "What happened", "What to improve", "Key takeaway"];
    const rowH = (cells: string[], size: number) =>
      Math.max(...cells.map((c, i) => doc.font("Helvetica").fontSize(size).heightOfString(c || "—", { width: cw[i] - 8 }))) + 10;
    const drawRow = (cells: string[], header = false) => {
      const size = header ? 8 : 9.5;
      const hgt = rowH(cells, size);
      ensure(hgt + 4);
      const y = doc.y;
      if (header) doc.rect(left, y, pageW, hgt).fill("#F6EFD9");
      let x = left;
      cells.forEach((c, i) => {
        doc.fillColor(header ? MUTED : INK).font(header ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(c || "—", x + 4, y + 5, { width: cw[i] - 8 });
        x += cw[i];
      });
      doc.moveTo(left, y + hgt).lineTo(left + pageW, y + hgt).strokeColor(RULE).lineWidth(0.5).stroke();
      doc.y = y + hgt;
      doc.x = left;
    };
    drawRow(heads, true);
    for (const c of w.clips) drawRow([c.time, c.situation, c.what_happened, c.improve, c.takeaway]);

    // Drills table
    section("Recommended workouts & drills", "Targeted workouts and drills to help you improve.");
    const dw = [100, 120, pageW - 400, 80, 100];
    const drawDrill = (cells: string[], header = false) => {
      const size = header ? 8 : 9.5;
      const hgt = Math.max(...cells.map((c, i) => doc.font("Helvetica").fontSize(size).heightOfString(c || "—", { width: dw[i] - 8 }))) + 10;
      ensure(hgt + 4);
      const y = doc.y;
      if (header) doc.rect(left, y, pageW, hgt).fill("#F6EFD9");
      let x = left;
      cells.forEach((c, i) => {
        doc.fillColor(header ? MUTED : INK).font(header ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(c || "—", x + 4, y + 5, { width: dw[i] - 8 });
        x += dw[i];
      });
      doc.moveTo(left, y + hgt).lineTo(left + pageW, y + hgt).strokeColor(RULE).lineWidth(0.5).stroke();
      doc.y = y + hgt;
      doc.x = left;
    };
    drawDrill(["Area of focus", "Workout / drill", "Description", "Frequency", "Notes"], true);
    for (const d of w.drills) drawDrill([d.area, d.drill, d.description, d.frequency, d.notes]);

    section("Next steps", "Action plan for your development.");
    bullets(w.next_steps);
    if (w.notes) {
      section("Additional notes");
      doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(w.notes);
    }

    doc.moveDown(1.5);
    doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text("First Line Performance · firstlineperform.com · Real insight. Real athletes. Real development.", { align: "center" });
    doc.end();
  });
}
