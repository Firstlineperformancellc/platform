// Seed the Hanson brothers as demo FLP Mentors on a Supabase project.
// Usage: node deploy/demo/seed-hansons.mjs <dev|prod> [--remove]
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from services/api/.env.<env>. Idempotent: re-running
// updates the profiles and photos. Photos: put jeff.jpg|png, steve.jpg|png, jack.jpg|png in
// deploy/demo/avatars/ and they are used; otherwise the drawn SVG avatars in this folder are.
// Their notification emails are plus-addresses of admin@ so nothing ever bounces.
import { createClient } from "../../apps/product/node_modules/@supabase/supabase-js/dist/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const envName = process.argv[2];
const remove = process.argv.includes("--remove");
if (!["dev", "prod"].includes(envName)) { console.error("usage: node deploy/demo/seed-hansons.mjs <dev|prod> [--remove]"); process.exit(1); }
const env = Object.fromEntries(fs.readFileSync(path.join(root, "services/api", `.env.${envName}`), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "OldTimeHockey-1977!";

const HANSONS = [
  {
    key: "jeff", email: "admin+jeff.hanson@firstlineperform.com", name: "Jeff Hanson", slug: "jeff-hanson",
    tier: "pro", highest_level: "ahl", positions: ["forward"], current_team: "Charlestown Chiefs · age 80, still first over the boards",
    specialties: ["Puttin' on the foil", "The first shift", "Finishing the check", "Pre-game warm-ups (mandatory)"],
    bio: "Eighty years old and I still take the opening shift. I break down your kid's game the way we played it in Charlestown: watch the puck, finish your check, never skip the warm-up. Glasses taped for everyone's safety. I have a toy car collection and I will bring it up.",
    availability: [{ dow: 1, start: "18:00", end: "21:00" }, { dow: 3, start: "18:00", end: "21:00" }, { dow: 6, start: "09:00", end: "12:00" }],
  },
  {
    key: "steve", email: "admin+steve.hanson@firstlineperform.com", name: "Steve Hanson", slug: "steve-hanson",
    tier: "pro", highest_level: "echl", positions: ["forward"], current_team: "Charlestown Chiefs · age 80, 80% of original teeth",
    specialties: ["Forechecking", "Not admiring your passes", "Reading the play (eventually)", "Foil, advanced"],
    bio: "Twin? Brother? Nobody's sure and we don't take questions. I teach forwards to stop admiring their own passes and get to the net. Fifty years of old-time hockey, most of it on the ice. Eighty years old, 80 percent of my teeth, 100 percent effort.",
    availability: [{ dow: 2, start: "19:00", end: "21:30" }, { dow: 4, start: "19:00", end: "21:30" }, { dow: 0, start: "13:00", end: "16:00" }],
  },
  {
    key: "jack", email: "admin+jack.hanson@firstlineperform.com", name: "Jack Hanson", slug: "jack-hanson",
    tier: "ncaa", highest_level: "ncaa_d3", positions: ["defense", "forward"], current_team: "Charlestown Chiefs · age 80, speed undisclosed",
    specialties: ["Gap control", "Defensive zone coverage", "Saying four words per game", "Old-time hockey"],
    bio: "The quiet one. I watch the whole game twice before I say a word, then I say about four. Defense is a state of mind and a place on the ice, and I'll show your kid both. Played three seasons of Division 3 hockey before the Chiefs called. Age 80. Speed undisclosed.",
    availability: [{ dow: 1, start: "20:00", end: "22:00" }, { dow: 5, start: "17:00", end: "20:00" }],
  },
];

async function findUser(email) {
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

function photoFile(key) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const p = path.join(here, "avatars", `${key}.${ext}`);
    if (fs.existsSync(p)) return { path: p, type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", ext: ext === "jpeg" ? "jpg" : ext };
  }
  return { path: path.join(here, `hanson-${key}.svg`), type: "image/svg+xml", ext: "svg" };
}

for (const h of HANSONS) {
  let user = await findUser(h.email);
  if (remove) {
    if (user) { await sb.auth.admin.deleteUser(user.id); console.log(`removed ${h.name}`); } else console.log(`${h.name} not present`);
    continue;
  }
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({ email: h.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: h.name, role: "athlete" } });
    if (error) { console.error(`create ${h.name}:`, error.message); process.exit(1); }
    user = data.user;
  }
  await sb.from("profiles").update({ role: "athlete", full_name: h.name }).eq("id", user.id);
  const photo = photoFile(h.key);
  const storagePath = `${user.id}/avatar.${photo.ext}`;
  const { error: upErr } = await sb.storage.from("avatars").upload(storagePath, fs.readFileSync(photo.path), { contentType: photo.type, upsert: true });
  if (upErr) console.warn(`photo for ${h.name}:`, upErr.message);
  const row = {
    user_id: user.id, slug: h.slug, display_name: h.name, bio: h.bio, specialties: h.specialties, positions: h.positions,
    status: "approved", approved_at: new Date().toISOString(), tier: h.tier, highest_level: h.highest_level, current_team: h.current_team,
    badges: [], verified: false, capacity_on_deck: 3, availability: h.availability, timezone: "America/Detroit",
    photo_path: upErr ? null : storagePath, credentials: [{ label: "Charlestown Chiefs, Federal League" }],
  };
  const { error } = await sb.from("athletes").upsert(row, { onConflict: "user_id" });
  if (error) { console.error(`athlete ${h.name}:`, error.message); process.exit(1); }
  console.log(`${h.name} ready: ${h.email}  (photo: ${path.basename(photo.path)})`);
}
if (!remove) console.log(`\nSign in as any of them with password ${PASSWORD} to demo the mentor side.`);
