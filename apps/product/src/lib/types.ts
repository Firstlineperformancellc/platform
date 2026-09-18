export type Role = "parent" | "athlete" | "admin";
export type HockeyPosition = "forward" | "defense" | "goalie";
export type AthleteStatus = "applied" | "approved" | "suspended";

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
};

export const POSITIONS: { key: HockeyPosition; label: string }[] = [
  { key: "forward", label: "Forward" },
  { key: "defense", label: "Defense" },
  { key: "goalie", label: "Goalie" },
];

export function firstName(fullName: string | undefined | null) {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}
