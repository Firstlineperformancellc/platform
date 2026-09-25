import { api } from "./api";
import { supabase } from "./supabase";

// Support desk reads go to Supabase under RLS (admins see everything; a requester sees their own);
// every change goes through the API, which also sends the emails.

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type Ticket = {
  id: string; number: number; subject: string; status: TicketStatus; priority: "low" | "normal" | "high" | "urgent";
  channel: "email" | "app" | "site"; requester_email: string; requester_name: string; requester_id: string | null;
  assigned_to: string | null; tags: string[]; last_message_at: string; last_direction: "in" | "out" | "note"; created_at: string; resolved_at: string | null;
  assignee: { full_name: string } | null;
};
export type Message = { id: string; direction: "in" | "out" | "note"; author_id: string | null; from_email: string; to_email: string; body_text: string; body_html: string | null; attachments: { name: string; size?: number }[]; created_at: string; author: { full_name: string } | null };
export type Canned = { id: string; title: string; body: string; sort: number };

const TCOLS = "id, number, subject, status, priority, channel, requester_email, requester_name, requester_id, assigned_to, tags, last_message_at, last_direction, created_at, resolved_at, assignee:assigned_to(full_name)";

export async function listTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase.from("support_tickets").select(TCOLS).order("last_message_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Ticket[];
}
export async function getTicket(id: string): Promise<Ticket | null> {
  const { data, error } = await supabase.from("support_tickets").select(TCOLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Ticket | null) ?? null;
}
export async function listMessages(ticketId: string): Promise<Message[]> {
  const { data, error } = await supabase.from("support_messages").select("id, direction, author_id, from_email, to_email, body_text, body_html, attachments, created_at, author:author_id(full_name)").eq("ticket_id", ticketId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Message[];
}
export async function listCanned(): Promise<Canned[]> {
  const { data } = await supabase.from("support_canned_replies").select("id, title, body, sort").order("sort").order("title");
  return (data ?? []) as Canned[];
}
export async function listAdmins(): Promise<{ id: string; full_name: string; email: string }[]> {
  const { data } = await supabase.from("profiles").select("id, full_name, email").eq("role", "admin").order("full_name");
  return (data ?? []) as { id: string; full_name: string; email: string }[];
}
export async function ticketCounts() {
  const [open, pending] = await Promise.all([
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return { open: open.count ?? 0, pending: pending.count ?? 0 };
}

export const replyTicket = (id: string, body: string, status?: TicketStatus) => api<{ ok: true; mailed: boolean; error: string | null }>(`/support/admin/${id}/reply`, { method: "POST", body: JSON.stringify({ body, status }) });
export const noteTicket = (id: string, body: string) => api<{ ok: true }>(`/support/admin/${id}/note`, { method: "POST", body: JSON.stringify({ body }) });
export const updateTicket = (id: string, patch: Partial<Pick<Ticket, "status" | "priority" | "assigned_to" | "tags" | "subject">>) => api<{ ok: true }>(`/support/admin/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const saveCanned = (row: { id?: string; title: string; body: string; sort?: number }) => api<{ ok: true }>("/support/admin/canned", { method: "POST", body: JSON.stringify(row) });
export const deleteCanned = (id: string) => api<{ ok: true }>(`/support/admin/canned/${id}`, { method: "DELETE" });

// Users page: email a person; the API opens a ticket so the reply comes back into the desk.
export const contactUser = (userId: string, subject: string, body: string) => api<{ ok: true; number: number; ticketId: string; mailed: boolean; error: string | null }>(`/support/admin/contact/${userId}`, { method: "POST", body: JSON.stringify({ subject, body }) });

// requester side
export const openTicket = (subject: string, body: string) => api<{ ok: true; number: number; ticketId: string }>("/support/tickets", { method: "POST", body: JSON.stringify({ subject, body }) });
export const requesterReply = (id: string, body: string) => api<{ ok: true }>(`/support/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ body }) });
export async function myTickets(): Promise<Ticket[]> {
  const { data } = await supabase.from("support_tickets").select(TCOLS).order("last_message_at", { ascending: false });
  return (data ?? []) as unknown as Ticket[];
}

export const STATUS_LABEL: Record<TicketStatus, string> = { open: "Open", pending: "Waiting on customer", resolved: "Resolved", closed: "Closed" };
export function age(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}
