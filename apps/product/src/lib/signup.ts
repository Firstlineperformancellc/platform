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
