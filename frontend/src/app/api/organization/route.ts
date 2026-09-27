import { NextResponse } from "next/server";

import {
  attempts,
  callerKey,
  codeConfigured,
  codeMatches,
  readJson,
  requestUser,
  serviceClient,
  supabaseConfigured,
} from "@/lib/server/demo-codes";

export const runtime = "nodejs";

/**
 * Temporary demo: turns the signed-in account into an organization when the
 * code matches CAMPUS_ORG_ACCESS_CODE. The browser can't set is_org itself.
 */
export async function POST(req: Request) {
  if (!codeConfigured("CAMPUS_ORG_ACCESS_CODE"))
    return NextResponse.json({ error: "Organization access isn't available right now." }, { status: 503 });

  const user = supabaseConfigured ? await requestUser(req) : null;
  if (supabaseConfigured && !user) return NextResponse.json({ error: "Sign in again, then try once more." }, { status: 401 });

  const key = callerKey(req, user?.id ?? null, "org");
  const wait = attempts.blockedFor(key);
  if (wait > 0)
    return NextResponse.json({ error: "Too many wrong codes. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(wait) } });

  const body = await readJson(req);
  if (!codeMatches("CAMPUS_ORG_ACCESS_CODE", body.code)) {
    attempts.fail(key);
    return NextResponse.json({ error: "That organization code isn't right." }, { status: 403 });
  }
  attempts.clear(key);

  // Local preview has no database; the browser keeps the flag for this demo account.
  if (!supabaseConfigured) return NextResponse.json({ ok: true, mode: "local" });

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "The server isn't set up to verify organizations yet." }, { status: 503 });

  const { error } = await admin
    .from("profiles")
    .upsert({ id: user!.id, is_org: true, org_verified_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    console.warn("organization upgrade failed", { userId: user!.id, code: error.code });
    const missing = /is_org|org_verified_at/.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "Organization accounts need one more database update. Run backend/supabase/migrations/20260927020000_rallies_organizations.sql."
          : "Couldn't update your account. Please try again.",
      },
      { status: 500 },
    );
  }
  console.info(JSON.stringify({ type: "organization_verified", userId: user!.id, at: new Date().toISOString() }));
  return NextResponse.json({ ok: true, mode: "supabase" });
}
