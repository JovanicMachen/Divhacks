"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { localAccountStore } from "./local-account";
import { getSupabase } from "./supabase/client";

/** A row of `public.event_messages`. Deleted rows arrive with an empty message. */
export interface ChatMessage {
  id: string;
  event_id: string;
  user_id: string;
  message: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Client only: shown while the insert is on its way. */
  pending?: boolean;
}

export interface ChatAuthor {
  name: string;
  avatarUrl: string | null;
}

export const MESSAGE_MAX = 500;
const HISTORY_LIMIT = 200;
const COLUMNS = "id,event_id,user_id,message,created_at,edited_at,deleted_at";
const CHAT_MIGRATION = "backend/supabase/migrations/20260927050000_live_chat_compat.sql";
const FALLBACK_NAME = "Columbia student";

interface ChatBackend {
  list: (eventId: string) => Promise<ChatMessage[]>;
  /** `id` is chosen by the client so a retry or the realtime echo can't create a second copy. */
  send: (eventId: string, message: string, id: string) => Promise<ChatMessage>;
  remove: (id: string) => Promise<ChatMessage>;
  /** Inserts and soft-deletes for one event only. */
  subscribe: (eventId: string, onRow: (row: ChatMessage) => void) => () => void;
  authors: (userIds: string[]) => Promise<Record<string, ChatAuthor>>;
}

function describe(error: PostgrestError | { message: string; code?: string }): Error {
  const message = error.message ?? "";
  if (/failed to fetch|network|load failed/i.test(message))
    return new Error("Couldn't reach Campus Connect's servers. Check your connection and try again.");
  if (error.code === "42P01" || error.code === "PGRST205" || /event_messages/.test(message) && /does not exist|schema cache/i.test(message))
    return new Error(`Event chat needs one more database update. Run ${CHAT_MIGRATION} in the Supabase SQL editor.`);
  if (/event_messages_length/.test(message)) return new Error(`Messages can be up to ${MESSAGE_MAX} characters.`);
  if (/event_messages_not_blank/.test(message)) return new Error("Write a message first.");
  if (error.code === "42501" || /row-level security/i.test(message))
    return new Error("Only students going to this event can post. Tap I'm Going, then try again.");
  return new Error(message || "Something went wrong. Please try again.");
}

function createSupabaseChat(supabase: SupabaseClient): ChatBackend {
  return {
    async list(eventId) {
      const { data, error } = await supabase
        .from("event_messages")
        .select(COLUMNS)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) throw describe(error);
      return ((data ?? []) as ChatMessage[]).reverse();
    },
    async send(eventId, message, id) {
      // user_id defaults to auth.uid(); RLS rejects any other author, and anyone not going.
      const { data, error } = await supabase
        .from("event_messages")
        .insert({ id, event_id: eventId, message })
        .select(COLUMNS)
        .single();
      if (error?.code === "23505") {
        // Already stored by an earlier attempt: return that row instead of a copy.
        const existing = await supabase.from("event_messages").select(COLUMNS).eq("id", id).single();
        if (existing.error) throw describe(existing.error);
        return existing.data as ChatMessage;
      }
      if (error) throw describe(error);
      return data as ChatMessage;
    },
    async remove(id) {
      // The database stamps the time, blanks the text and keeps it for moderation.
      const { data, error } = await supabase
        .from("event_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .select(COLUMNS)
        .single();
      if (error) throw describe(error);
      return data as ChatMessage;
    },
    subscribe(eventId, onRow) {
      const channel = supabase
        .channel(`event-chat:${eventId}:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "event_messages", filter: `event_id=eq.${eventId}` },
          (payload) => onRow(payload.new as ChatMessage),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "event_messages", filter: `event_id=eq.${eventId}` },
          (payload) => onRow(payload.new as ChatMessage),
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
    async authors(userIds) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .in("id", userIds);
      if (error) return {};
      const out: Record<string, ChatAuthor> = {};
      for (const row of (data ?? []) as Array<{
        id: string;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }>) {
        out[row.id] = {
          name: row.display_name?.trim() || (row.username ? `@${row.username}` : FALLBACK_NAME),
          avatarUrl: row.avatar_url,
        };
      }
      return out;
    },
  };
}

const LOCAL_KEY = "campus-connect.event-messages";
const LOCAL_CHANNEL = "campus-connect.event-messages";

/** Local preview: messages live in this browser and other tabs hear about them. */
function createLocalChat(): ChatBackend {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOCAL_CHANNEL) : null;
  const read = (): ChatMessage[] => {
    try {
      const rows = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const write = (rows: ChatMessage[], row: ChatMessage) => {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
    channel?.postMessage(row);
  };
  const me = () => localAccountStore.getSnapshot()?.user.id ?? null;

  return {
    async list(eventId) {
      return read()
        .filter((row) => row.event_id === eventId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-HISTORY_LIMIT);
    },
    async send(eventId, message, id) {
      const userId = me();
      if (!userId) throw new Error("You need to be signed in to chat.");
      const existing = read().find((row) => row.id === id);
      if (existing) return existing;
      const row: ChatMessage = {
        id,
        event_id: eventId,
        user_id: userId,
        message,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      };
      write([...read(), row], row);
      return row;
    },
    async remove(id) {
      const rows = read();
      const target = rows.find((row) => row.id === id);
      if (!target || target.user_id !== me()) throw new Error("You can only delete your own messages.");
      const next: ChatMessage = { ...target, message: "", deleted_at: new Date().toISOString() };
      write(
        rows.map((row) => (row.id === id ? next : row)),
        next,
      );
      return next;
    },
    subscribe(eventId, onRow) {
      const listener = channel ? new BroadcastChannel(LOCAL_CHANNEL) : null;
      const onMessage = (e: MessageEvent<ChatMessage>) => e.data.event_id === eventId && onRow(e.data);
      listener?.addEventListener("message", onMessage);
      return () => listener?.close();
    },
    async authors(userIds) {
      const out: Record<string, ChatAuthor> = {};
      for (const id of userIds) {
        const profile = localAccountStore.publicProfile(id);
        out[id] = { name: profile?.name || FALLBACK_NAME, avatarUrl: profile?.avatarUrl ?? null };
      }
      return out;
    },
  };
}

let backendFor: { remote: boolean; backend: ChatBackend } | null = null;
function chatBackend(remote: boolean): ChatBackend {
  if (backendFor?.remote !== remote) {
    const supabase = remote ? getSupabase() : null;
    backendFor = { remote, backend: supabase ? createSupabaseChat(supabase) : createLocalChat() };
  }
  return backendFor.backend;
}

const NO_MESSAGES: ChatMessage[] = [];

const byTime = (a: ChatMessage, b: ChatMessage) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

interface UseEventChatOptions {
  remote: boolean;
  userId: string | null;
  /** A message from someone else arrived live (not history, not your own). */
  onIncoming?: (row: ChatMessage) => void;
}

/**
 * Chat for the one event that is open. The subscription is created for that
 * event only and removed when the event changes or the drawer closes.
 */
export function useEventChat(eventId: string | null, { remote, userId, onIncoming }: UseEventChatOptions) {
  const [state, setState] = useState<{ eventId: string | null; messages: ChatMessage[]; loaded: boolean; error: string | null }>({
    eventId: null,
    messages: [],
    loaded: false,
    error: null,
  });
  const [authors, setAuthors] = useState<Record<string, ChatAuthor>>({});
  const [attempt, setAttempt] = useState(0);
  const requested = useRef(new Set<string>());
  const incomingRef = useRef(onIncoming);
  useEffect(() => {
    incomingRef.current = onIncoming;
  }, [onIncoming]);

  /** Insert or replace by id, so the same message can never appear twice. */
  const merge = useCallback((target: string, row: ChatMessage) => {
    setState((prev) => {
      if (prev.eventId !== target) return { eventId: target, messages: [row], loaded: false, error: null };
      const current = prev.messages.find((m) => m.id === row.id);
      // A late optimistic copy must not overwrite the stored row.
      if (current && !current.pending && row.pending) return prev;
      const others = prev.messages.filter((m) => m.id !== row.id);
      return { ...prev, messages: [...others, row].sort(byTime) };
    });
  }, []);

  const drop = useCallback((target: string, id: string) => {
    setState((prev) => (prev.eventId === target ? { ...prev, messages: prev.messages.filter((m) => m.id !== id) } : prev));
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const backend = chatBackend(remote);
    let active = true;
    const known = new Set<string>();

    // Subscribe first so nothing sent while history loads is missed.
    const unsubscribe = backend.subscribe(eventId, (row) => {
      if (!active) return;
      const isNew = !known.has(row.id);
      known.add(row.id);
      merge(eventId, row);
      if (isNew && !row.deleted_at && row.user_id !== userId) incomingRef.current?.(row);
    });
    backend.list(eventId).then(
      (rows) => {
        if (!active) return;
        rows.forEach((row) => known.add(row.id));
        setState((prev) => {
          const byId = new Map(rows.map((row) => [row.id, row]));
          if (prev.eventId === eventId) prev.messages.forEach((row) => byId.set(row.id, row));
          return { eventId, messages: [...byId.values()].sort(byTime), loaded: true, error: null };
        });
      },
      (error: Error) => active && setState({ eventId, messages: [], loaded: true, error: error.message }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [eventId, remote, userId, merge, attempt]);

  const messages = useMemo(
    () => (state.eventId === eventId ? state.messages : NO_MESSAGES),
    [state.eventId, state.messages, eventId],
  );

  // Look up names and photos for authors not seen yet.
  useEffect(() => {
    const missing = [...new Set(messages.map((m) => m.user_id))].filter((id) => !requested.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(id));
    void chatBackend(remote)
      .authors(missing)
      .then((found) => setAuthors((prev) => ({ ...prev, ...found })));
  }, [messages, remote]);

  const send = useCallback(
    async (text: string): Promise<string | null> => {
      if (!eventId || !userId) return "Open an event first.";
      const message = text.trim();
      if (!message) return "Write a message first.";
      if (message.length > MESSAGE_MAX) return `Messages can be up to ${MESSAGE_MAX} characters.`;
      const id = crypto.randomUUID();
      merge(eventId, {
        id,
        event_id: eventId,
        user_id: userId,
        message,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        pending: true,
      });
      try {
        merge(eventId, await chatBackend(remote).send(eventId, message, id));
        return null;
      } catch (error) {
        drop(eventId, id);
        return error instanceof Error ? error.message : "Couldn't send your message.";
      }
    },
    [eventId, userId, remote, merge, drop],
  );

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      if (!eventId) return null;
      try {
        merge(eventId, await chatBackend(remote).remove(id));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't delete that message.";
      }
    },
    [eventId, remote, merge],
  );

  return {
    messages,
    authors,
    loaded: state.eventId === eventId && state.loaded,
    error: state.eventId === eventId ? state.error : null,
    send,
    remove,
    retry: () => setAttempt((n) => n + 1),
  };
}

/** "Now", "2m", "14m", "1h", "3d" from the stored created_at. */
export function messageAge(createdAt: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(createdAt)) / 60_000);
  if (Number.isNaN(minutes) || minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
