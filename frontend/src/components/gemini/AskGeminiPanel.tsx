"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, X } from "lucide-react";

import { GeminiSparkle } from "./GeminiSparkle";
import { answerCampusQuestion, fetchGeminiReply } from "./ask-gemini";
import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import { useCampusFeedback } from "@/lib/campus-feedback";
import { useMediaQuery } from "@/lib/use-media-query";
import type { CampusEvent } from "@/types/event";

const OPEN_EASE = [0.32, 0.72, 0, 1] as const;
const SUGGESTIONS = ["What's happening now?", "Where's free food?", "How do I post an event?"];

interface Message {
  id: number;
  role: "assistant" | "user";
  text: string;
  matches?: CampusEvent[];
  question?: string;
}

interface AskGeminiPanelProps {
  /** Docked column beside the map, or the phone sheet. */
  layout: "dock" | "sheet";
  open: boolean;
  onClose: () => void;
  events: CampusEvent[];
  selectedEvent: CampusEvent | null;
  onSelectEvent: (event: CampusEvent) => void;
  userId: string | null;
  authorName: string;
}

function seedMessage(): Message {
  return {
    id: 0,
    role: "assistant",
    text: "Hi — I'm Gemini, on the side of the map. Ask what's happening at Columbia. If an answer is useful, share it so other students can see it too.",
  };
}

/** Ask Gemini beside the campus map, with notes other students have shared. */
export function AskGeminiPanel({
  layout,
  open,
  onClose,
  events,
  selectedEvent,
  onSelectEvent,
  userId,
  authorName,
}: AskGeminiPanelProps) {
  const titleId = useId();
  const isSheet = useMediaQuery("(max-width: 899px)");
  const { notes, share } = useCampusFeedback();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [sharing, setSharing] = useState<number | null>(null);
  const [shared, setShared] = useState<Set<number>>(() => new Set());
  const [shareError, setShareError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => [seedMessage()]);
  const listRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || layout !== "sheet") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const focus = window.setTimeout(() => fieldRef.current?.focus(), 180);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focus);
    };
  }, [open, onClose, layout]);

  useEffect(() => {
    if (layout === "dock" && open) fieldRef.current?.focus();
  }, [layout, open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    const userIdStamp = Date.now();
    setInput("");
    setPending(true);
    setShareError(null);
    setMessages((current) => [...current, { id: userIdStamp, role: "user", text }]);

    try {
      const reply = await fetchGeminiReply(text, events, selectedEvent);
      setMessages((current) => [
        ...current,
        { id: userIdStamp + 1, role: "assistant", text: reply.text, matches: reply.matches, question: text },
      ]);
    } catch {
      const reply = answerCampusQuestion(text, events, selectedEvent);
      setMessages((current) => [
        ...current,
        { id: userIdStamp + 1, role: "assistant", text: reply.text, matches: reply.matches, question: text },
      ]);
    } finally {
      setPending(false);
    }
  };

  const shareNote = async (message: Message) => {
    if (!message.question || sharing != null) return;
    if (!userId) {
      setShareError("Sign in to share this with other students.");
      return;
    }
    setSharing(message.id);
    setShareError(null);
    const error = await share({
      userId,
      authorName,
      question: message.question,
      answer: message.text,
      eventId: message.matches?.[0]?.id ?? selectedEvent?.id ?? null,
    });
    setSharing(null);
    if (error) {
      setShareError(error);
      return;
    }
    setShared((current) => new Set(current).add(message.id));
  };

  const body = (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #4B8BFF 0%, #7C5CFF 48%, #C084FC 100%)" }}
        >
          <GeminiSparkle size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-[16px] font-extrabold tracking-[-0.02em] text-ink">
            Ask Gemini
          </h2>
          <p className="truncate text-[12.5px] font-medium text-muted">Map answers for you and campus</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Ask Gemini"
          className="grid h-[30px] w-[30px] place-items-center rounded-full bg-field text-ink transition-colors hover:bg-[#e6eaf2]"
        >
          <X size={16} strokeWidth={2.6} />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5 scrollbar-none">
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                message.role === "user"
                  ? "max-w-[88%] rounded-[16px] bg-brand px-3.5 py-2.5 text-[14px] font-medium leading-[1.4] text-white"
                  : "max-w-[92%] rounded-[16px] bg-field px-3.5 py-2.5 text-[14px] font-medium leading-[1.45] text-ink-soft"
              }
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.matches && message.matches.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {message.matches.slice(0, 5).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      className="flex w-full items-center gap-2 rounded-[11px] bg-panel px-2.5 py-2 text-left transition-colors hover:bg-brand-tint"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-field">
                        <CategoryGlyph category={event.category} size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-ink">{event.title}</span>
                        <span className="block truncate text-[12px] font-medium text-muted">{event.locationName}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {message.role === "assistant" && message.question && (
                <button
                  type="button"
                  disabled={sharing === message.id || shared.has(message.id)}
                  onClick={() => void shareNote(message)}
                  className="mt-2 text-[12.5px] font-bold text-brand disabled:text-muted"
                >
                  {shared.has(message.id) ? "Shared with campus" : sharing === message.id ? "Sharing…" : "Share with campus"}
                </button>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="max-w-[92%] rounded-[16px] bg-field px-3.5 py-2.5 text-[14px] font-medium text-muted">
            Thinking…
          </div>
        )}

        {messages.length === 1 && !pending && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void ask(suggestion)}
                className="rounded-full border border-line bg-panel px-3 py-[7px] text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand/30 hover:bg-brand-tint hover:text-brand"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <section aria-label="Shared with campus" className="border-t border-line pt-3">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.04em] text-faint">From other students</h3>
            <div className="mt-2 flex flex-col gap-1.5">
              {notes.slice(0, 4).map((note) => {
                const event = note.eventId ? events.find((item) => item.id === note.eventId) : undefined;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => event && onSelectEvent(event)}
                    className="rounded-[12px] bg-field px-3 py-2 text-left"
                  >
                    <span className="block truncate text-[12px] font-bold text-ink">{note.authorName}</span>
                    <span className="mt-0.5 block text-[13px] font-medium leading-[1.35] text-ink-soft">
                      {note.answer}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {shareError && <p className="text-[12.5px] font-semibold text-coral-text">{shareError}</p>}
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          ref={fieldRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ask Gemini about campus events"
          placeholder="Ask about campus events…"
          disabled={pending}
          className="h-11 min-w-0 flex-1 rounded-full border border-transparent bg-field px-4 text-[14.5px] font-medium text-ink placeholder:font-normal placeholder:text-faint outline-none transition-colors focus:border-brand/30 focus:bg-white disabled:opacity-70"
        />
        <motion.button
          type="submit"
          aria-label="Send question"
          disabled={pending || !input.trim()}
          whileTap={{ scale: 0.94 }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #4B8BFF 0%, #7C5CFF 48%, #C084FC 100%)" }}
        >
          <ArrowUp size={18} strokeWidth={2.6} />
        </motion.button>
      </form>
    </div>
  );

  if (layout === "dock") {
    if (!open) return null;
    return (
      <section aria-labelledby={titleId} className="flex h-full min-h-0 w-full flex-col">
        {body}
      </section>
    );
  }

  return (
    <AnimatePresence>
      {open && isSheet && (
        <motion.button
          key="ask-gemini-backdrop"
          type="button"
          aria-label="Close Ask Gemini"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[65] bg-ink/25"
        />
      )}
      {open && (
        <motion.div
          key="ask-gemini"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.24, ease: OPEN_EASE }}
          className="fixed inset-x-2 bottom-2 z-[70] flex max-h-[82vh] flex-col overflow-hidden rounded-[20px] shadow-float"
        >
          {body}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
