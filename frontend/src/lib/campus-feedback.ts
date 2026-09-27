"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

/** A short note a student chose to share from Ask Gemini. Everyone signed in can read it. */
export type CampusNote = {
  id: string;
  userId: string;
  authorName: string;
  question: string;
  answer: string;
  eventId: string | null;
  createdAt: string;
};

const KEY = "campus-connect.campus-feedback";
const CHANNEL_NAME = "campus-connect-feedback";

function readLocal(): CampusNote[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CampusNote[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(notes: CampusNote[]) {
  window.localStorage.setItem(KEY, JSON.stringify(notes.slice(0, 30)));
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage("updated");
  channel.close();
}

function fromRow(row: Record<string, unknown>): CampusNote | null {
  if (typeof row.id !== "string" || typeof row.question !== "string" || typeof row.answer !== "string") return null;
  return {
    id: row.id,
    userId: typeof row.user_id === "string" ? row.user_id : "",
    authorName: typeof row.author_name === "string" && row.author_name ? row.author_name : "A student",
    question: row.question,
    answer: row.answer,
    eventId: typeof row.event_id === "string" ? row.event_id : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

/** Recent campus notes. Uses Supabase when it is configured, otherwise this browser. */
export function useCampusFeedback() {
  const [notes, setNotes] = useState<CampusNote[]>([]);
  const [remote, setRemote] = useState(isSupabaseConfigured);

  useEffect(() => {
    let active = true;
    const supabase = remote ? getSupabase() : null;
    if (!supabase) {
      setNotes(readLocal());
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = () => {
        if (active) setNotes(readLocal());
      };
      return () => {
        active = false;
        channel.close();
      };
    }

    const load = async () => {
      const { data, error } = await supabase
        .from("campus_feedback")
        .select("id, user_id, author_name, question, answer, event_id, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!active) return;
      if (error) {
        setRemote(false);
        setNotes(readLocal());
        return;
      }
      setNotes((data ?? []).map((row) => fromRow(row)).filter((note): note is CampusNote => Boolean(note)));
    };

    void load();
    const channel = supabase
      .channel("campus-feedback")
      .on("postgres_changes", { event: "*", schema: "public", table: "campus_feedback" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [remote]);

  const share = useCallback(
    async (input: {
      userId: string;
      authorName: string;
      question: string;
      answer: string;
      eventId: string | null;
    }): Promise<string | null> => {
      const question = input.question.trim().slice(0, 280);
      const answer = input.answer.trim().slice(0, 500);
      if (!question || !answer) return "Ask Gemini something before sharing it.";
      const supabase = remote ? getSupabase() : null;
      if (!supabase) {
        const note: CampusNote = {
          id: crypto.randomUUID(),
          userId: input.userId,
          authorName: input.authorName || "You",
          question,
          answer,
          eventId: input.eventId,
          createdAt: new Date().toISOString(),
        };
        writeLocal([note, ...readLocal()]);
        setNotes(readLocal());
        return null;
      }
      const { error } = await supabase.from("campus_feedback").insert({
        user_id: input.userId,
        author_name: (input.authorName || "A student").slice(0, 80),
        question,
        answer,
        event_id: input.eventId,
      });
      if (error) return "Couldn't share that yet. Run the campus feedback SQL in Supabase, then try again.";
      return null;
    },
    [remote],
  );

  return { notes, share };
}
