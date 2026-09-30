import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// After supabase.auth.signUp with email confirmations on, three things can come back:
// a session (confirmations off), a user with no identities (the address already has a confirmed
// account, and no email is sent), or a user awaiting confirmation. Say the true thing for each.
export function signUpOutcome(data: { user: User | null; session: Session | null }): "signed_in" | "exists" | "check_email" {
  if (data.session) return "signed_in";
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return "exists";
  return "check_email";
}
export const EXISTS_MESSAGE = "There's already an account with this email. Sign in instead, or use Forgot password on the sign-in page.";
export const checkEmailMessage = (email: string, then: string) =>
  `We sent a confirmation link to ${email}. It can take a couple of minutes to arrive, so check spam too. Opening it signs you in${then}.`;

// The confirmation link for a mentor applicant lands on the "email confirmed" page, not the dashboard.
export const applicantConfirmUrl = () => (typeof window !== "undefined" ? `${window.location.origin}/applied?confirmed=1` : undefined);

export async function resendConfirmation(email: string, redirectTo?: string) {
  const { error } = await supabase.auth.resend({ type: "signup", email, options: redirectTo ? { emailRedirectTo: redirectTo } : undefined });
  if (error) throw new Error(/after \d+ seconds|security purposes/i.test(error.message) ? "Give it a minute before asking for another email." : error.message);
}

export type ApplicationPayload = {
  bio: string; positions: string[]; team: string; eliteprospects_url: string | null;
  motivations: string[]; motivation_other: string | null; special_circumstances: string | null; age: number | null; gender: string | null;
};
const slugify = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mentor"}-${Math.random().toString(36).slice(2, 6)}`;

// The mentor row plus the private answers, as the person themself (RLS: own rows only).
export async function saveApplicationRows(userId: string, fullName: string, a: ApplicationPayload) {
  const name = fullName.trim() || "FLP Mentor";
  const { error } = await supabase.from("athletes").insert({
    user_id: userId, slug: slugify(name), display_name: name, bio: a.bio, positions: a.positions,
    credentials: a.team ? [{ label: a.team }] : [], current_team: a.team, eliteprospects_url: a.eliteprospects_url,
  });
  if (error) throw new Error(error.message);
  await supabase.from("athlete_applications").insert({ user_id: userId, motivations: a.motivations, motivation_other: a.motivation_other, special_circumstances: a.special_circumstances, age: a.age, gender: a.gender });
}

// When the account already existed (unconfirmed) the database cannot save the answers at sign-up, so
// keep them in this browser until the confirmation link brings the person back.
const STASH = "flp.pendingApplication";
export function stashApplication(email: string, fullName: string, application: ApplicationPayload) {
  try { localStorage.setItem(STASH, JSON.stringify({ email: email.toLowerCase(), fullName, application, at: Date.now() })); } catch { /* private mode etc. */ }
}
export function takeStashedApplication(email: string): { fullName: string; application: ApplicationPayload } | null {
  try {
    const raw = localStorage.getItem(STASH);
    if (!raw) return null;
    const d = JSON.parse(raw) as { email: string; fullName: string; application: ApplicationPayload; at: number };
    if (d.email !== email.toLowerCase() || Date.now() - d.at > 7 * 86400000) return null;
    localStorage.removeItem(STASH);
    return { fullName: d.fullName, application: d.application };
  } catch { return null; }
}
