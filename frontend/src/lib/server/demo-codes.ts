import { createHash, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Temporary hackathon access codes, checked only on the server. The codes live
 * in server environment variables; unset them to switch a feature off.
 * Never import this file from a client component.
 */

export type DemoCode = "CAMPUS_ADMIN_EVENT_CODE" | "CAMPUS_ORG_ACCESS_CODE";

export function codeConfigured(name: DemoCode): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Constant-time comparison of hashes, so timing doesn't reveal the code. */
export function codeMatches(name: DemoCode, input: unknown): boolean {
  const expected = process.env[name]?.trim();
  if (!expected || typeof input !== "string") return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(input.trim()), digest(expected));
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

/**
 * Failed-attempt limit per caller. Kept in this server instance's memory, which
 * is enough to slow guessing during a demo; it resets when the instance restarts.
 */
export const attempts = {
  blockedFor(key: string): number {
    const now = Date.now();
    const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    failures.set(key, recent);
    if (recent.length < MAX_FAILURES) return 0;
    return Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
  },
  fail(key: string) {
    failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
  },
  clear(key: string) {
    failures.delete(key);
  },
};

export function callerKey(req: Request, userId: string | null, scope: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${userId ?? "anon"}:${ip}`;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && PUBLIC_KEY);

/** The signed-in user behind the request's bearer token, verified with Supabase Auth. */
export async function requestUser(req: Request): Promise<{ id: string } | null> {
  if (!SUPABASE_URL || !PUBLIC_KEY) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(SUPABASE_URL, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : { id: data.user.id };
}

/** Server-only client that bypasses RLS. Null when the service-role key isn't set. */
export function serviceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
