"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ellipsis, Loader2, Lock, MessageCircle, Pin, PinOff, SendHorizontal, Trash2 } from "lucide-react";

import { Avatar } from "@/components/account/Avatar";
import { MESSAGE_MAX, messageAge, type ChatAuthor, type ChatMessage } from "@/lib/event-chat";
import { cn } from "@/lib/utils";

interface EventChatProps {
  messages: ChatMessage[];
  authors: Record<string, ChatAuthor>;
  loaded: boolean;
  loadError: string | null;
  currentUserId: string | null;
  /** Set when the chat is read-only, with the reason shown in place of the composer. */
  closedReason: string | null;
  send: (text: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  /** Only for the event's organizer; pins or (with null) unpins their message. */
  onPin?: (messageId: string | null) => Promise<string | null>;
  pinnedMessageId: string | null;
}

const NEAR_BOTTOM_PX = 80;

export function EventChat({
  messages,
  authors,
  loaded,
  loadError,
  currentUserId,
  closedReason,
  send,
  remove,
  onPin,
  pinnedMessageId,
}: EventChatProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const counterId = useId();

  // Relative times ("2m") only; nothing is written anywhere.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const last = messages.at(-1);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (stickToBottom.current || last?.user_id === currentUserId) list.scrollTop = list.scrollHeight;
  }, [last?.id, last?.user_id, currentUserId, loaded]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 112)}px`;
  }, [draft]);

  const pinned = pinnedMessageId ? messages.find((m) => m.id === pinnedMessageId && !m.deleted_at) : undefined;
  const trimmed = draft.trim();
  const tooLong = trimmed.length > MESSAGE_MAX;

  const submit = async () => {
    if (lock.current || closedReason) return;
    if (!trimmed) return;
    if (tooLong) {
      setError(`Messages can be up to ${MESSAGE_MAX} characters.`);
      return;
    }
    lock.current = true;
    setSending(true);
    setError(null);
    const failure = await send(trimmed);
    lock.current = false;
    setSending(false);
    if (failure) {
      setError(failure);
      return;
    }
    stickToBottom.current = true;
    setDraft("");
    fieldRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-[26px] pb-2 pt-3">
        <MessageCircle size={16} strokeWidth={2.3} aria-hidden className="text-brand" />
        <h2 className="text-[15px] font-extrabold tracking-[-0.01em] text-ink">Event Chat</h2>
      </div>

      {pinned && (
        <div className="mx-[18px] mb-2 flex shrink-0 items-start gap-2.5 rounded-[14px] bg-brand-tint px-3 py-2.5">
          <Pin size={15} strokeWidth={2.4} aria-hidden className="mt-[2px] shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-brand">Organizer</p>
            <p className="mt-[1px] whitespace-pre-wrap break-words text-[13.5px] font-semibold leading-[1.35] text-ink">
              {pinned.message}
            </p>
          </div>
          {onPin && !closedReason && (
            <button
              type="button"
              onClick={() => void onPin(null).then((e) => e && setError(e))}
              aria-label="Unpin message"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-brand transition-colors hover:bg-white"
            >
              <PinOff size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>
      )}

      <ul
        ref={listRef}
        aria-label="Messages"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto border-y border-line px-[18px] py-3 scrollbar-none"
      >
        {!loaded && (
          <li className="flex items-center justify-center gap-2 py-8 text-[13.5px] font-medium text-muted">
            <Loader2 size={16} strokeWidth={2.4} aria-hidden className="animate-spin" />
            Loading chat…
          </li>
        )}
        {loaded && loadError && (
          <li role="alert" className="rounded-[12px] bg-coral-soft px-3 py-2.5 text-[13px] font-semibold text-coral-text">
            {loadError}
          </li>
        )}
        {loaded && !loadError && messages.length === 0 && (
          <li className="px-4 py-8 text-center">
            <p className="text-[14px] font-bold text-ink">No messages yet</p>
            <p className="mt-1 text-[13px] font-medium text-muted">
              {closedReason ? "Nobody posted in this chat." : "Say hi to everyone heading over."}
            </p>
          </li>
        )}
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              author={authors[message.user_id]}
              own={message.user_id === currentUserId}
              age={messageAge(message.created_at, now)}
              pinned={message.id === pinnedMessageId}
              canPin={Boolean(onPin) && !closedReason && message.user_id === currentUserId}
              onDelete={() => void remove(message.id).then((e) => e && setError(e))}
              onPin={() => void onPin?.(message.id === pinnedMessageId ? null : message.id).then((e) => e && setError(e))}
            />
          ))}
        </AnimatePresence>
      </ul>

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
      ) : (
        <form
          className="flex shrink-0 items-end gap-2 px-[14px] pb-[14px] pt-2.5"
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
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              aria-label="Message everyone at this event"
              aria-describedby={draft.length > MESSAGE_MAX - 100 ? counterId : undefined}
              placeholder="Message everyone..."
              className="block max-h-[112px] w-full resize-none rounded-[18px] border border-transparent bg-field px-4 py-[11px] text-[14.5px] font-medium leading-[1.35] text-ink placeholder:font-normal placeholder:text-faint outline-none transition-colors focus:border-brand/30 focus:bg-white scrollbar-none"
            />
            {draft.length > MESSAGE_MAX - 100 && (
              <span id={counterId} className="absolute bottom-1 right-3 text-[11px] font-semibold text-faint">
                {MESSAGE_MAX - draft.length}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={sending || !trimmed || tooLong}
            aria-busy={sending || undefined}
            className="flex h-[43px] shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-[14.5px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.24)] transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#9DB9EE] disabled:shadow-none"
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("group flex items-start gap-2", own && "flex-row-reverse")}
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
      {own && !deleted && <MessageMenu pinned={pinned} canPin={canPin} onDelete={onDelete} onPin={onPin} />}
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
          "grid h-7 w-7 place-items-center rounded-full text-faint transition-[opacity,colors] hover:bg-field hover:text-ink",
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
