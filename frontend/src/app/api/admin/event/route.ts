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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_EVENT_IMAGES_BUCKET ?? "event-images";

/**
 * Temporary demo: deletes or cancels any stored event when the code matches
 * CAMPUS_ADMIN_EVENT_CODE. Logs who did what; never logs the code.
 */
export async function POST(req: Request) {
  if (!codeConfigured("CAMPUS_ADMIN_EVENT_CODE"))
    return NextResponse.json({ error: "Admin event actions are turned off." }, { status: 503 });

  const user = supabaseConfigured ? await requestUser(req) : null;
  if (supabaseConfigured && !user) return NextResponse.json({ error: "Sign in again, then try once more." }, { status: 401 });

  const key = callerKey(req, user?.id ?? null, "admin");
  const wait = attempts.blockedFor(key);
  if (wait > 0)
    return NextResponse.json({ error: "Too many wrong codes. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(wait) } });

  const body = await readJson(req);
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const action = body.action === "cancel" ? "cancel" : body.action === "delete" ? "delete" : null;
  if (!eventId || !action) return NextResponse.json({ error: "Choose an event and an action." }, { status: 400 });

  if (!codeMatches("CAMPUS_ADMIN_EVENT_CODE", body.code)) {
    attempts.fail(key);
    return NextResponse.json({ error: "That admin code isn't right." }, { status: 403 });
  }
  attempts.clear(key);

  if (!UUID.test(eventId))
    return NextResponse.json(
      { error: "Official Columbia listings ship with the app and aren't stored in the database, so they can't be removed here." },
      { status: 400 },
    );

  const entry = { type: "admin_event_action", userId: user?.id ?? null, eventId, action, at: new Date().toISOString() };

  // Local preview has no database; the browser applies the change to its own copy.
  if (!supabaseConfigured) {
    console.info(JSON.stringify({ ...entry, mode: "local" }));
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "The server isn't set up for admin actions yet." }, { status: 503 });

  const { data: rows, error: readError } = await admin
    .from("events")
    .select("id, created_by, image_url, status")
    .eq("id", eventId)
    .limit(1);
  if (readError) return NextResponse.json({ error: "Couldn't load that event." }, { status: 500 });
  const target = rows?.[0];
  if (!target) return NextResponse.json({ error: "That event no longer exists." }, { status: 404 });

  let row: unknown = null;
  if (action === "delete") {
    const { error } = await admin.from("events").delete().eq("id", eventId);
    if (error) return NextResponse.json({ error: "Couldn't delete the event." }, { status: 500 });
    if (target.image_url && target.created_by) {
      const folder = `${target.created_by}/${eventId}`;
      const { data: files } = await admin.storage.from(PHOTO_BUCKET).list(folder);
      if (files?.length) await admin.storage.from(PHOTO_BUCKET).remove(files.map((f) => `${folder}/${f.name}`));
    }
  } else {
    if (target.status !== "active") return NextResponse.json({ error: "This event was already cancelled." }, { status: 409 });
    const { data, error } = await admin
      .from("events")
      .update({ status: "abandoned", abandoned_at: new Date().toISOString() })
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Couldn't cancel the event." }, { status: 500 });
    row = data;
  }

  console.info(JSON.stringify(entry));
  const { error: logError } = await admin
    .from("admin_event_actions")
    .insert({ actor_id: user!.id, event_id: eventId, action });
  if (logError) console.warn("admin action log not saved", { eventId, action });

  return NextResponse.json({ ok: true, mode: "supabase", row });
}
