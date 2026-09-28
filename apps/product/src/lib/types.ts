export type Role = "parent" | "athlete" | "admin";
export type HockeyPosition = "forward" | "defense" | "goalie";
export type AthleteStatus = "applied" | "approved" | "suspended" | "deactivated";

export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  email: string;
};

export type Athlete = {
  user_id: string;
  slug: string;
  display_name: string;
  bio: string;
  positions: HockeyPosition[];
  status: AthleteStatus;
  payouts_enabled: boolean;
  tier?: "pro" | "pwhl" | "ncaa" | null;
};

export type Motivation = "money" | "fulltime" | "help" | "multiple" | "other";
export const MOTIVATIONS: { key: Motivation; label: string }[] = [
  { key: "money", label: "I want to make some extra money" },
  { key: "fulltime", label: "I want to mentor full time as my primary income" },
  { key: "help", label: "I want to help young athletes" },
  { key: "multiple", label: "Multiple reasons (multiple fields selectable)" },
  { key: "other", label: "Other" },
];
export type Gender = "male" | "female" | "nonbinary" | "unspecified";
export const GENDERS: { key: Gender; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "nonbinary", label: "Non-binary" },
  { key: "unspecified", label: "Prefer not to say" },
];
export const GENDER_LABEL = Object.fromEntries(GENDERS.map((g) => [g.key, g.label])) as Record<Gender, string>;
export const MOTIVATION_LABEL = Object.fromEntries(MOTIVATIONS.map((m) => [m.key, m.label])) as Record<Motivation, string>;
// Elite Prospects links: accept a bare or full URL on eliteprospects.com, return it normalised or null when it isn't one.
export function normaliseEliteProspects(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(url);
    return /(^|\.)eliteprospects\.com$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

export const POSITIONS: { key: HockeyPosition; label: string }[] = [
  { key: "forward", label: "Forward" },
  { key: "defense", label: "Defense" },
  { key: "goalie", label: "Goalie" },
];

export function firstName(fullName: string | undefined | null) {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}
