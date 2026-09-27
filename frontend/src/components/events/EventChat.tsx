"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  Check,
  Ellipsis,
  Loader2,
  Lock,
  MessageCircle,
  Pin,
  PinOff,
  RotateCw,
  SendHorizontal,
  Trash2,
  Users,
} from "lucide-react";

import { Avatar } from "@/components/account/Avatar";
import { MESSAGE_MAX, messageAge, type ChatAuthor, type ChatMessage } from "@/lib/event-chat";
import { cn } from "@/lib/utils";

/** Shown instead of the composer to someone who isn't part of the event yet. */
export interface ChatLock {
  message: string;
  actionLabel: string;
  /** Resolves with an error message, or null once they're in. */
  onAction: () => Promise<string | null>;
}

interface EventChatProps {
  messages: ChatMessage[];
  authors: Record<string, ChatAuthor>;
  loaded: boolean;
  loadError: string | null;
  onRetry: () => void;
  currentUserId: string | null;
  /** Set when the chat is read-only, with the reason shown in place of the composer. */
  closedReason: string | null;
  /** Set when the viewer can read but not post until they join. */
  locked: ChatLock | null;
  send: (text: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  /** Only for the event's organizer; pins or (with null) unpins their message. */
  onPin?: (messageId: string | null) => Promise<string | null>;
  pinnedMessageId: string | null;
}

const NEAR_BOTTOM_PX = 80;
const FIELD_MAX_PX = 112;

export function EventChat({
  messages,
  authors,
  loaded,
  loadError,
  onRetry,
  currentUserId,
  closedReason,
  locked,
  send,
  remove,
  onPin,
  pinnedMessageId,
}: EventChatProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [unseen, setUnseen] = useState(0);
  // The text being edited, read at send time so a repeated Enter can't resend stale text.
  const draftRef = useRef("");
  const lock = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const seenCount = useRef(0);
  const counterId = useId();

  // Relative times ("2m") only; nothing is written anywhere.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
  }, []);

  // Follow new messages only when the reader is already at the bottom, or sent it themselves.
  const last = messages.at(-1);
  useLayoutEffect(() => {
    const added = messages.length - seenCount.current;
    seenCount.current = messages.length;
    if (!loaded || added <= 0) return;
    const mine = last?.user_id === currentUserId;
    if (atBottom.current || mine || added === messages.length) {
      scrollToBottom(added !== messages.length);
      setUnseen(0);
    } else {
      setUnseen((n) => n + added);
    }
  }, [messages.length, last?.user_id, currentUserId, loaded, scrollToBottom]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, FIELD_MAX_PX)}px`;
  }, [draft]);

  const pinned = pinnedMessageId ? messages.find((m) => m.id === pinnedMessageId && !m.deleted_at) : undefined;
  const tooLong = draft.trim().length > MESSAGE_MAX;
  const canPost = !closedReason && !locked;

  const updateDraft = (value: string) => {
    draftRef.current = value;
    setDraft(value);
  };

  const submit = async () => {
    if (lock.current || !canPost) return;
    const text = draftRef.current.trim();
    if (!text) return;
    if (text.length > MESSAGE_MAX) {
      setError(`Messages can be up to ${MESSAGE_MAX} characters.`);
      return;
    }
    // Take the text out of the box before sending, so a second Enter or click finds nothing to send.
    lock.current = true;
    updateDraft("");
    setSending(true);
    setError(null);
    atBottom.current = true;
    const failure = await send(text);
    lock.current = false;
    setSending(false);
    if (failure) {
      setError(failure);
      if (!draftRef.current) updateDraft(text);
      return;
    }
    fieldRef.current?.focus({ preventScroll: true });
  };

  const join = async () => {
    if (!locked || joining) return;
    setJoining(true);
    setError(null);
    const failure = await locked.onAction();
    setJoining(false);
    if (failure) setError(failure);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-[26px] pb-2 pt-3">
        <MessageCircle size={16} strokeWidth={2.3} aria-hidden className="text-brand" />
        <h2 className="text-[15px] font-extrabold tracking-[-0.01em] text-ink">Event Chat</h2>
        {loaded && messages.length > 0 && (
          <span className="ml-auto text-[12px] font-semibold text-faint">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        )}
      </div>

      {pinned && (
        <div className="mx-[18px] mb-2 flex shrink-0 items-start gap-2.5 rounded-[14px] bg-brand-tint px-3 py-2.5">
          <Pin size={15} strokeWidth={2.4} aria-hidden className="mt-[2px] shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-brand">Organizer</p>
            <p className="mt-[1px] max-h-[4.2em] overflow-y-auto whitespace-pre-wrap break-words text-[13.5px] font-semibold leading-[1.35] text-ink scrollbar-none">
              {pinned.message}
            </p>
          </div>
          {onPin && !closedReason && (
            <button
              type="button"
              onClick={() => void onPin(null).then((e) => e && setError(e))}
              aria-label="Unpin message"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand transition-colors hover:bg-white tablet:h-7 tablet:w-7"
            >
              <PinOff size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col border-y border-line">
        <ul
          ref={listRef}
          aria-label="Messages"
          aria-live="polite"
          aria-busy={!loaded || undefined}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
            if (atBottom.current && unseen) setUnseen(0);
          }}
          data-sheet-scroll=""
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-none px-[18px] py-3 scrollbar-none"
        >
          {!loaded && <ChatSkeleton />}
          {loaded && loadError && (
            <li className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <p role="alert" className="text-[13.5px] font-semibold text-coral-text">
                {loadError}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="flex h-10 items-center gap-2 rounded-full bg-field px-4 text-[13.5px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2]"
              >
                <RotateCw size={15} strokeWidth={2.4} aria-hidden />
                Try again
              </button>
            </li>
          )}
          {loaded && !loadError && messages.length === 0 && (
            <li className="flex flex-col items-center px-4 py-8 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-tint text-brand">
                <MessageCircle size={20} strokeWidth={2.2} aria-hidden />
              </span>
              <p className="mt-3 text-[14.5px] font-bold text-ink">No messages yet</p>
              <p className="mt-1 max-w-[240px] text-[13px] font-medium text-muted">
                {closedReason
                  ? "Nobody posted in this chat."
                  : locked
                    ? "Join to start the conversation."
                    : "Say hi to everyone heading over."}
              </p>
            </li>
          )}
          <AnimatePresence initial={false}>
            {loaded &&
              messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  author={authors[message.user_id]}
                  own={message.user_id === currentUserId}
                  age={message.pending ? "Sending…" : messageAge(message.created_at, now)}
                  pinned={message.id === pinnedMessageId}
                  canPin={Boolean(onPin) && !closedReason && message.user_id === currentUserId && !message.pending}
                  onDelete={() => void remove(message.id).then((e) => e && setError(e))}
                  onPin={() => void onPin?.(message.id === pinnedMessageId ? null : message.id).then((e) => e && setError(e))}
                />
              ))}
          </AnimatePresence>
        </ul>
        <AnimatePresence>
          {unseen > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              onClick={() => {
                scrollToBottom(true);
                setUnseen(0);
              }}
              className="absolute bottom-3 left-1/2 flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-bold text-white shadow-float"
              style={{ translateX: "-50%" }}
            >
              <ArrowDown size={14} strokeWidth={2.6} aria-hidden />
              {unseen === 1 ? "1 new message" : `${unseen} new messages`}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <p role="alert" className="mx-[18px] mt-2 shrink-0 text-[12.5px] font-semibold text-coral-text">
          {error}
        </p>
      )}

      {closedReason ? (
        <p className="m-[14px] flex shrink-0 items-center gap-2 rounded-[13px] bg-field px-3.5 py-3 text-[13.5px] font-semibold text-muted">
          <Lock size={15} strokeWidth={2.4} aria-hidden className="shrink-0" />
          {closedReason}
        </p>
      ) : locked ? (
        <div className="m-[14px] flex shrink-0 items-center gap-3 rounded-[14px] bg-brand-tint px-3.5 py-3">
          <Users size={18} strokeWidth={2.3} aria-hidden className="shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-[1.35] text-ink-soft">{locked.message}</p>
          <button
            type="button"
            onClick={() => void join()}
            disabled={joining}
            aria-busy={joining || undefined}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-[14px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.24)] transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-80 tablet:h-10"
          >
            {joining ? <Loader2 size={15} strokeWidth={2.6} aria-hidden className="animate-spin" /> : <Check size={15} strokeWidth={3} aria-hidden />}
            {locked.actionLabel}
          </button>
        </div>
      ) : (
        <form
          className="flex shrink-0 items-end gap-2 px-[14px] pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={fieldRef}
              rows={1}
              value={draft}
              maxLength={MESSAGE_MAX}
              enterKeyHint="send"
              onChange={(e) => {
                updateDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!e.repeat) void submit();
                }
              }}
              aria-label="Message everyone at this event"
              aria-describedby={draft.length > MESSAGE_MAX - 100 ? counterId : undefined}
              placeholder="Message everyone..."
              className="block max-h-[112px] w-full resize-none rounded-[18px] border border-transparent bg-field px-4 py-[11px] text-[16px] font-medium leading-[1.35] text-ink placeholder:font-normal placeholder:text-faint outline-none transition-colors focus:border-brand/30 focus:bg-white scrollbar-none tablet:text-[14.5px]"
            />
            {draft.length > MESSAGE_MAX - 100 && (
              <span id={counterId} className="absolute bottom-1 right-3 text-[11px] font-semibold text-faint">
                {MESSAGE_MAX - draft.length}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={sending || !draft.trim() || tooLong}
            aria-busy={sending || undefined}
            className="flex h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-[14.5px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.24)] transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#9DB9EE] disabled:shadow-none tablet:h-[43px]"
          >
            {sending ? (
              <Loader2 size={16} strokeWidth={2.6} aria-hidden className="animate-spin" />
            ) : (
              <SendHorizontal size={16} strokeWidth={2.4} aria-hidden />
            )}
            Send
          </button>
        </form>
      )}
    </div>
  );
}

/** Placeholder bubbles while history loads. */
function ChatSkeleton() {
  return (
    <>
      {[62, 44, 70].map((width, i) => (
        <li key={width} aria-hidden className={cn("flex items-start gap-2", i === 1 && "flex-row-reverse")}>
          <span className="h-[30px] w-[30px] shrink-0 animate-pulse rounded-full bg-field" />
          <span className={cn("flex flex-col gap-1.5", i === 1 ? "items-end" : "items-start")} style={{ width: `${width}%` }}>
            <span className="h-3 w-16 animate-pulse rounded bg-field" />
            <span className="h-9 w-full animate-pulse rounded-[16px] bg-field" />
          </span>
        </li>
      ))}
      <li className="sr-only">Loading chat…</li>
    </>
  );
}

interface MessageRowProps {
  message: ChatMessage;
  author: ChatAuthor | undefined;
  own: boolean;
  age: string;
  pinned: boolean;
  canPin: boolean;
  onDelete: () => void;
  onPin: () => void;
}

function MessageRow({ message, author, own, age, pinned, canPin, onDelete, onPin }: MessageRowProps) {
  const deleted = Boolean(message.deleted_at);
  const name = author?.name ?? "Columbia student";
  return (
    <motion.li
      layout="position"
      data-pending={message.pending || undefined}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("group flex items-start gap-2", own && "flex-row-reverse", message.pending && "opacity-70")}
    >
      <Avatar src={author?.avatarUrl} name={name} size={30} className="mt-[1px]" />
      <div className={cn("flex min-w-0 max-w-[78%] flex-col", own ? "items-end" : "items-start")}>
        <span className="px-1 text-[12px] font-bold text-ink-soft">{name}</span>
        <div
          className={cn(
            "mt-[2px] rounded-[16px] px-3 py-2 text-[14px] leading-[1.4]",
            deleted
              ? "border border-dashed border-line-strong bg-transparent italic text-faint"
              : own
                ? "rounded-tr-[6px] bg-brand font-medium text-white"
                : "rounded-tl-[6px] bg-field font-medium text-ink",
          )}
        >
          {deleted ? "Message deleted" : <p className="whitespace-pre-wrap break-words">{message.message}</p>}
        </div>
        <span className="mt-[3px] flex items-center gap-1 px-1 text-[11px] font-semibold text-faint">
          {pinned && !deleted && <Pin size={10} strokeWidth={2.6} aria-label="Pinned" />}
          <time dateTime={message.created_at}>{age}</time>
        </span>
      </div>
      {own && !deleted && !message.pending && <MessageMenu pinned={pinned} canPin={canPin} onDelete={onDelete} onPin={onPin} />}
    </motion.li>
  );
}

function MessageMenu({
  pinned,
  canPin,
  onDelete,
  onPin,
}: {
  pinned: boolean;
  canPin: boolean;
  onDelete: () => void;
  onPin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(true);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const wrap = wrapRef.current;
    const list = wrap?.closest("ul");
    // Open downward near the top of the scrolling list so the menu isn't clipped.
    if (wrap && list) setOpenUp(wrap.getBoundingClientRect().top - list.getBoundingClientRect().top > 96);
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex h-9 w-full items-center gap-2 rounded-[9px] px-2.5 text-left text-[13px] font-semibold outline-none transition-colors";

  return (
    <div ref={wrapRef} className="relative mt-[18px] shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label="Message options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full text-faint transition-[opacity,colors] hover:bg-field hover:text-ink tablet:h-7 tablet:w-7",
          "opacity-100 tablet:opacity-0 tablet:focus-visible:opacity-100 tablet:group-hover:opacity-100",
          open && "tablet:opacity-100",
        )}
      >
        <Ellipsis size={15} strokeWidth={2.6} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute left-0 z-10 w-[168px] rounded-[12px] border border-line bg-panel p-1 shadow-float",
              openUp ? "bottom-8" : "top-8",
            )}
          >
            {canPin && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPin();
                }}
                className={cn(item, "text-ink hover:bg-brand-tint focus-visible:bg-brand-tint")}
              >
                <Pin size={15} strokeWidth={2.3} aria-hidden />
                {pinned ? "Unpin message" : "Pin message"}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className={cn(item, "text-coral-text hover:bg-coral-soft focus-visible:bg-coral-soft")}
            >
              <Trash2 size={15} strokeWidth={2.3} aria-hidden />
              Delete message
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
