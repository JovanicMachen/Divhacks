import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser side of the temporary demo codes. The codes are only ever sent to
 * the server routes, which compare them against server environment variables.
 */

async function authHeaders(supabase: SupabaseClient | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!supabase) return headers;
  const { data } = await supabase.auth.getSession();
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

async function post(path: string, body: unknown, supabase: SupabaseClient | null) {
  try {
    const response = await fetch(path, { method: "POST", headers: await authHeaders(supabase), body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean; mode?: string; row?: unknown };
    return response.ok ? { ok: true as const, data } : { ok: false as const, error: data.error ?? "Something went wrong." };
  } catch {
    return { ok: false as const, error: "Couldn't reach Campus Connect's servers. Check your connection and try again." };
  }
}

/** Resolves with an error message, or null once the server verified the code. */
export async function requestOrganization(code: string, supabase: SupabaseClient | null): Promise<string | null> {
  if (!code.trim()) return "Enter the organization code.";
  const result = await post("/api/organization", { code }, supabase);
  return result.ok ? null : result.error;
}

export type AdminAction = "delete" | "cancel";

export async function requestAdminAction(
  eventId: string,
  action: AdminAction,
  code: string,
  supabase: SupabaseClient | null,
): Promise<{ error: string } | { ok: true; mode: "supabase" | "local"; row: unknown }> {
  if (!code.trim()) return { error: "Enter the admin code." };
  const result = await post("/api/admin/event", { eventId, action, code }, supabase);
  if (!result.ok) return { error: result.error };
  return { ok: true, mode: result.data.mode === "local" ? "local" : "supabase", row: result.data.row ?? null };
}
