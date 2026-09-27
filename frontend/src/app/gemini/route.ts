import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM_INSTRUCTION = `You are the Campus Connect guide for Columbia University.
Use only the provided event list and selected event. Keep replies short and specific.
If the user wants food, mention Free Food events.
If they want to host, tell them to tap Post Event, then choose a spot on the map.
If an event is selected, prefer answering about that one.
When you mention events, end with a JSON line:
MATCHES: ["event-id-1"]
If nothing matches, MATCHES: []`;

function parseMatches(raw: string): { text: string; eventIds: string[] } {
  const match = raw.match(/MATCHES:\s*(\[[\s\S]*?\])/);
  let eventIds: string[] = [];
  if (match) {
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (Array.isArray(parsed)) eventIds = parsed.filter((id): id is string => typeof id === "string");
    } catch {
      eventIds = [];
    }
  }
  return { text: raw.replace(/MATCHES:\s*\[[\s\S]*?\]/, "").trim(), eventIds };
}

function slimEvent(event: unknown) {
  if (!event || typeof event !== "object") return null;
  const row = event as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof row[key] === "string" ? row[key].slice(0, max) : "");
  return {
    id: text("id", 80),
    title: text("title", 120),
    category: text("category", 40),
    locationName: text("locationName", 120),
    timeStatus: text("timeStatus", 80),
    host: text("host", 80),
    description: text("description", 280),
  };
}

/** Live Gemini answers for the side panel. The key stays on the server. */
export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "Gemini is not configured." }, { status: 503 });

  const body: unknown = await req.json().catch(() => null);
  const message =
    body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message.trim().slice(0, 500)
      : "";
  const currentEvents =
    body && typeof body === "object" && "currentEvents" in body && Array.isArray(body.currentEvents)
      ? body.currentEvents.slice(0, 40).map(slimEvent).filter(Boolean)
      : [];
  const selectedEvent =
    body && typeof body === "object" && "selectedEvent" in body ? slimEvent(body.selectedEvent) : null;

  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const prompt = [
    `Current events: ${JSON.stringify(currentEvents)}`,
    `Selected event: ${JSON.stringify(selectedEvent)}`,
    `User: ${message}`,
  ].join("\n");

  try {
    const result = await model.generateContent(prompt);
    return NextResponse.json(parseMatches(result.response.text()));
  } catch {
    return NextResponse.json({ error: "Gemini is unavailable right now." }, { status: 502 });
  }
}
