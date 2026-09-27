"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  CalendarDays,
  Building2,
  CalendarX2,
  Check,
  ChevronRight,
  Clock,
  Ellipsis,
  MapPin,
  Navigation,
  PersonStanding,
  Radar,
  ShieldAlert,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { AvatarStack } from "./AvatarStack";
import { CategoryHeroArt } from "./CategoryHeroArt";
import { CountdownChip } from "./CountdownChip";
import { EventChat, type ChatLock } from "./EventChat";
import { RallyPanel } from "@/components/rally/RallyPanel";
import { useAccount } from "@/components/account/AccountProvider";
import { EventHeroArt } from "./EventHeroArt";
import { CategoryGlyph, PeopleIcon } from "@/components/icons/CategoryIcons";
import { MARKER_PALETTE } from "@/lib/constants";
import { directionsUrl } from "@/lib/directions";
import { useEventChat } from "@/lib/event-chat";
import { isCancelled, useEventCountdown } from "@/lib/event-clock";
import { ORG_PURPLE } from "@/lib/rally";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUserEvents } from "@/lib/user-events";
import { cn, formatCount } from "@/lib/utils";
import type { CampusEvent } from "@/types/event";

const OPEN_EASE = [0.32, 0.72, 0, 1] as const;

interface EventDrawerProps {
  event: CampusEvent;
  onClose: () => void;
  isGoing: boolean;
  /** Resolves with an error message, or null once saved. */
  onToggleGoing: () => Promise<string | null> | void;
  isSaved: boolean;
  onToggleSaved: () => void;
  onShare: () => void;
  /** Only passed for the signed-in user's own student events. */
  onDelete?: () => void;
  /** Only passed for the signed-in user's own student events that are still active. */
  onCancelEvent?: () => void;
  /** Temporary demo admin override, offered to every signed-in user. */
  onAdminAction?: () => void;
}

type DrawerTab = "details" | "chat";

/**
 * Sliding detail panel for the selected event.
 *
 * Desktop: an in-flow right column, so the map reclaims the space as the panel
 * slides out. Below 900px it becomes a bottom sheet over the map.
 */
export function EventDrawer(props: EventDrawerProps) {
  const { event } = props;
  const isSheet = useMediaQuery("(max-width: 899px)");
  const isCompact = useMediaQuery("(max-width: 1199px)");

  if (isSheet) return <DrawerSheet {...props} />;

  const columnWidth = isCompact ? 360 : 416;

  return (
    <motion.div
      initial={{ width: columnWidth }}
      animate={{ width: columnWidth }}
      exit={{ width: 0 }}
      transition={{ duration: 0.26, ease: OPEN_EASE }}
      className="relative z-20 shrink-0 overflow-hidden"
    >
      <motion.aside
        aria-label={`${event.title} details`}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.3, ease: OPEN_EASE }}
        className="absolute inset-y-0 right-0 pb-[10px] pr-[6px] pt-2"
        style={{ width: columnWidth }}
      >
        <DrawerCard {...props} />
      </motion.aside>
    </motion.div>
  );
}

/**
 * How much of the layout viewport the on-screen keyboard covers, and the
 * height left above it. Null where the browser has no visualViewport.
 */
function useVisualViewport() {
  const [view, setView] = useState<{ inset: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setView({ inset: Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)), height: Math.round(vv.height) }),
      );
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return view;
}

/**
 * Phone bottom sheet. With Chat open it takes a fixed height so the message
 * list scrolls inside it, and it rides above the keyboard while typing.
 */
function DrawerSheet(props: EventDrawerProps) {
  const view = useVisualViewport();
  const keyboard = Boolean(view && view.inset > 80);
  return (
    <motion.aside
      aria-label={`${props.event.title} details`}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ duration: 0.28, ease: OPEN_EASE }}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[86vh] px-2 pb-2 has-[[data-drawer-tab=chat]]:h-[86dvh]"
      style={view ? { bottom: view.inset, maxHeight: Math.min(view.height * 0.94, view.height - 8) } : undefined}
    >
      <DrawerCard {...props} compactHero={keyboard} />
    </motion.aside>
  );
}

/** Renders `text` with the first occurrence of `emphasis` in bold. */
function Emphasized({ text, emphasis }: { text: string; emphasis?: string }) {
  const at = emphasis ? text.indexOf(emphasis) : -1;
  if (!emphasis || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-bold text-ink">{emphasis}</strong>
      {text.slice(at + emphasis.length)}
    </>
  );
}

const HERO_BUTTON =
  "grid h-[30px] w-[30px] place-items-center rounded-full bg-white/92 text-ink shadow-[0_1px_4px_rgba(15,37,71,0.18)] backdrop-blur-sm transition-all duration-150 hover:scale-[1.06] hover:bg-white active:scale-95";

function DrawerCard({
  event,
  onClose,
  isGoing,
  onToggleGoing,
  isSaved,
  onToggleSaved,
  onShare,
  onDelete,
  onCancelEvent,
  onAdminAction,
  compactHero = false,
}: EventDrawerProps & { compactHero?: boolean }) {
  const palette = MARKER_PALETTE[event.markerColor];
  const goingCount = event.goingCount + (isGoing ? 1 : 0);
  const countdown = useEventCountdown(event);
  const cancelled = isCancelled(event);
  const { mode, user } = useAccount();
  const { pinMessage, joinedRallies, joinRally } = useUserEvents();
  const userId = user?.id ?? null;

  // Tab and unread count belong to one event; switching events starts on Details.
  const [view, setView] = useState<{ id: string; tab: DrawerTab }>({ id: event.id, tab: "details" });
  const tab: DrawerTab = view.id === event.id ? view.tab : "details";
  const [unread, setUnread] = useState<{ id: string; count: number }>({ id: event.id, count: 0 });
  const unreadCount = unread.id === event.id ? unread.count : 0;
  const onIncoming = useCallback(() => {
    if (tab === "chat") return;
    setUnread((prev) => ({ id: event.id, count: (prev.id === event.id ? prev.count : 0) + 1 }));
  }, [tab, event.id]);
  const chat = useEventChat(event.id, { remote: mode === "supabase", userId, onIncoming });
  const openTab = (next: DrawerTab) => {
    setView({ id: event.id, tab: next });
    if (next === "chat") setUnread({ id: event.id, count: 0 });
  };

  const closedReason = cancelled
    ? "This event was cancelled. Chat is now closed."
    : countdown?.phase === "ended" || event.status === "ended"
      ? "This event has ended. Chat is now closed."
      : null;
  const isOrganizer = event.source === "student" && Boolean(userId) && event.createdBy === userId;
  // An anonymous Rally's creator stays anonymous in its chat too (their account still owns the row).
  const anonymousHost = event.rally?.anonymous && event.createdBy ? event.createdBy : null;
  const chatAuthors = useMemo(
    () =>
      anonymousHost
        ? { ...chat.authors, [anonymousHost]: { name: "Anonymous student", avatarUrl: null } }
        : chat.authors,
    [chat.authors, anonymousHost],
  );
  // Anyone signed in can read; posting needs Going (or the Rally join), like the database rule.
  const canPost = isOrganizer || isGoing || (event.rally !== null && joinedRallies.has(event.id));
  const chatLock: ChatLock | null =
    closedReason || canPost
      ? null
      : event.rally
        ? { message: "Join the Rally to participate in chat", actionLabel: "Join Rally", onAction: () => joinRally(event.id) }
        : {
            message: "Join the event to participate in chat",
            actionLabel: "I'm Going",
            onAction: async () => (await onToggleGoing()) ?? null,
          };

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden rounded-[20px] bg-panel shadow-panel">
      <div className="shrink-0 p-[12px] pb-0">
        <div
          className={cn(
            "relative overflow-hidden rounded-[16px] bg-[#D8CEC0] transition-[height] duration-200",
            compactHero && tab === "chat" ? "h-[64px]" : "h-[186px]",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={event.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              {event.imageUrl ? (
                // Event photos come from Supabase Storage or a local data URL.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.imageUrl}
                  alt={`Photo for ${event.title}`}
                  className="h-full w-full object-cover"
                />
              ) : event.iconType === "pizza" && event.source === "official" ? (
                <EventHeroArt />
              ) : (
                <CategoryHeroArt event={event} />
              )}
            </motion.div>
          </AnimatePresence>
          <div className="absolute right-[10px] top-[10px] flex gap-2">
            <button
              type="button"
              onClick={onToggleSaved}
              aria-label={isSaved ? "Remove from saved" : "Save event"}
              aria-pressed={isSaved}
              className={HERO_BUTTON}
            >
              <Bookmark
                size={15}
                strokeWidth={2.4}
                className={cn(isSaved && "fill-brand text-brand")}
              />
            </button>
            <button type="button" onClick={onShare} aria-label="Share event" className={HERO_BUTTON}>
              <Share2 size={15} strokeWidth={2.4} />
            </button>
            {(onDelete || onAdminAction) && (
              <ManageMenu key={event.id} onDelete={onDelete} onCancelEvent={onCancelEvent} onAdminAction={onAdminAction} />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close event details"
              className={HERO_BUTTON}
            >
              <X size={16} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Event sections" className="flex shrink-0 gap-1 border-b border-line px-[18px] pt-[6px]">
        {(["details", "chat"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => openTab(id)}
            className={cn(
              "relative flex h-[38px] items-center gap-1.5 px-2.5 text-[14px] font-bold transition-colors",
              tab === id ? "text-brand" : "text-muted hover:text-ink",
            )}
          >
            {id === "details" ? "Details" : "Chat"}
            {id === "chat" && unreadCount > 0 && (
              <span
                aria-label={`${unreadCount} new`}
                className="flex h-[18px] min-w-[18px] items-center justify-center gap-[3px] rounded-full bg-brand px-[6px] text-[11px] font-bold leading-none text-white"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            {tab === id && (
              <motion.span layoutId="drawer-tab" className="absolute inset-x-1.5 -bottom-px h-[2.5px] rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <div data-drawer-tab="chat" className="flex min-h-0 flex-1 flex-col">
          <EventChat
            messages={chat.messages}
            authors={chatAuthors}
            loaded={chat.loaded}
            loadError={chat.error}
            onRetry={chat.retry}
            currentUserId={userId}
            closedReason={closedReason}
            locked={chatLock}
            send={chat.send}
            remove={chat.remove}
            onPin={isOrganizer ? (messageId) => pinMessage(event.id, messageId) : undefined}
            pinnedMessageId={event.pinnedMessageId ?? null}
          />
        </div>
      ) : (
      <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={event.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="min-h-0 flex-1 overflow-y-auto px-[26px] pb-[18px] pt-[14px] scrollbar-none"
      >
        <span
          className="inline-flex h-[26px] items-center gap-[5px] rounded-full px-[10px] text-[13px] font-semibold"
          style={{ backgroundColor: palette.soft, color: palette.text }}
        >
          <CategoryGlyph category={event.category} size={15} />
          {event.category}
        </span>
        {onDelete && (
          <span className="ml-2 inline-flex h-[26px] items-center rounded-full bg-field px-[10px] text-[12.5px] font-semibold text-muted">
            Posted by you
          </span>
        )}

        {(event.organizationEvent || event.rally) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {event.rally && (
              <span
                className="inline-flex h-[24px] items-center gap-[5px] rounded-full px-[9px] text-[12px] font-extrabold uppercase tracking-[0.1em] text-white"
                style={{ backgroundColor: "#0f2547" }}
              >
                <Radar size={13} strokeWidth={2.5} aria-hidden />
                Rally{event.rally.anonymous ? " · anonymous" : ""}
              </span>
            )}
            {event.organizationEvent && (
              <span
                className="inline-flex h-[24px] items-center gap-[5px] rounded-full px-[9px] text-[12.5px] font-bold"
                style={{ backgroundColor: ORG_PURPLE.soft, color: ORG_PURPLE.text }}
              >
                <Building2 size={13} strokeWidth={2.4} aria-hidden />
                Organization Event
              </span>
            )}
            {event.isPaid && event.priceDisplay && (
              <span
                className="inline-flex h-[24px] items-center rounded-full border px-[9px] text-[12.5px] font-bold"
                style={{ borderColor: ORG_PURPLE.solid, color: ORG_PURPLE.text }}
                title="Price set by the organization. Campus Connect doesn't take payments."
              >
                {event.priceDisplay}
              </span>
            )}
          </div>
        )}

        <h1 className="mt-[9px] text-[32px] font-extrabold leading-[1.08] tracking-[-0.025em] text-ink">
          {event.title}
        </h1>
        <p className="mt-[4px] text-[15px] font-bold leading-[1.15] text-ink">
          {event.locationName}
        </p>

        <button
          type="button"
          className="mt-[17px] flex w-full items-center gap-[9px] text-left transition-colors duration-150 hover:text-brand"
        >
          <MapPin size={16} strokeWidth={2.2} aria-hidden className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[1.1] text-ink-soft">
            {event.address}
          </span>
          <ChevronRight size={16} strokeWidth={2.2} aria-hidden className="shrink-0 text-faint" />
        </button>

        <div className="mt-[14px] flex flex-wrap items-center gap-[10px]">
          <span className="inline-flex h-[30px] items-center gap-[6px] rounded-full bg-[#E2EBFB] px-[11px] text-[13.5px] font-semibold text-[#1559D0]">
            <PersonStanding size={15} strokeWidth={2.3} aria-hidden />
            {event.distance}
          </span>
          {countdown || cancelled ? (
            <CountdownChip event={event} size="md" />
          ) : (
            <span className="inline-flex h-[30px] items-center gap-[6px] rounded-full bg-coral-soft px-[11px] text-[13.5px] font-semibold text-coral-text">
              <Clock size={14} strokeWidth={2.4} aria-hidden />
              {event.timeStatus}
            </span>
          )}
        </div>


        {event.description && (
          <p className="mt-[18px] text-[15px] leading-[21px] text-ink-soft">
            <Emphasized text={event.description} emphasis={event.emphasis} />
          </p>
        )}

        {event.rally ? (
          <RallyPanel event={event} joined={joinedRallies.has(event.id)} onJoin={() => joinRally(event.id)} />
        ) : (
        <>
        <div className="mt-[16px] flex items-start">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-[9px]">
              <PeopleIcon size={20} aria-hidden className="shrink-0 text-brand" />
              <span className="truncate text-[15px] font-bold leading-[1.15] text-ink">
                {formatCount(goingCount)} going
              </span>
            </div>
            <AvatarStack
              className="mt-[8px]"
              people={isGoing ? ["You", "AR", "MK"] : ["AR", "MK", "JT"]}
              count={goingCount}
            />
          </div>

          <span aria-hidden className="mt-[2px] w-px self-stretch bg-line" />

          <div className="min-w-0 flex-1 pl-4">
            <div className="flex items-center gap-[9px]">
              <Star
                size={19}
                strokeWidth={2}
                aria-hidden
                className="shrink-0 fill-[#FBB234] text-[#FBB234]"
              />
              <span className="truncate text-[15px] font-bold leading-[1.15] text-ink">
                {formatCount(event.interestedCount)} interested
              </span>
            </div>
            <AvatarStack
              className="mt-[8px]"
              people={["SL", "DP", "NV"]}
              count={event.interestedCount}
            />
          </div>
        </div>

        {cancelled ? (
          <p className="mt-[21px] flex h-[42px] w-full items-center justify-center gap-[9px] rounded-[13px] bg-field text-[15px] font-bold text-muted">
            <CalendarX2 size={17} strokeWidth={2.3} aria-hidden />
            Cancelled by the organizer
          </p>
        ) : (
        <motion.button
          type="button"
          onClick={onToggleGoing}
          aria-pressed={isGoing}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={cn(
            "mt-[21px] flex h-[42px] w-full items-center justify-center gap-[9px] rounded-[13px] text-[16px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.26)] transition-colors duration-150 active:bg-brand-press",
            isGoing ? "bg-brand-dark hover:bg-brand-press" : "bg-brand hover:bg-brand-dark",
          )}
        >
          <span aria-hidden className="grid h-[19px] w-[19px] place-items-center rounded-full bg-white">
            <Check size={12} strokeWidth={3.4} className="text-brand" />
          </span>
          {isGoing ? "You're Going" : "I'm Going"}
        </motion.button>
        )}
        </>
        )}

        <motion.a
          href={directionsUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Directions to ${event.locationName} (opens in a new tab)`}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="mt-[9px] flex h-[42px] w-full items-center justify-center gap-[9px] rounded-[13px] bg-brand-soft text-[16px] font-bold text-brand transition-colors duration-150 hover:bg-[#dde8fa]"
        >
          <Navigation size={17} strokeWidth={2.2} aria-hidden className="fill-brand" />
          Directions
        </motion.a>

        {!event.rally && (
        <div className="mt-[18px] flex items-start gap-[11px]">
          <CalendarDays
            size={19}
            strokeWidth={2.1}
            aria-hidden
            className="mt-[3px] shrink-0 text-[#48587A]"
          />
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold leading-[1.2] text-ink">{event.dateLabel}</p>
            <p className="mt-[4px] text-[14.5px] font-medium leading-[1.2] text-muted">
              {event.endTime ? (
                <>
                  {event.startTime} – {event.endTime}{" "}
                  <span className="font-semibold text-coral-text">({cancelled ? "Cancelled" : (countdown?.label ?? event.timeStatus)})</span>
                </>
              ) : (
                event.startTime
              )}
            </p>
          </div>
        </div>
        )}

        <button
          type="button"
          className="mt-[20px] flex w-full items-center gap-[11px] text-left transition-colors duration-150 hover:text-brand"
        >
          <PeopleIcon size={20} aria-hidden className="shrink-0 text-[#48587A]" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[1.2] text-ink-soft">
            Hosted by {event.host}
          </span>
          <ChevronRight size={17} strokeWidth={2.2} aria-hidden className="shrink-0 text-faint" />
        </button>
      </motion.div>
      </AnimatePresence>
      )}
    </div>
  );
}

/** "•••" menu. Owner actions for your own events, plus the temporary demo admin action. */
function ManageMenu({
  onDelete,
  onCancelEvent,
  onAdminAction,
}: {
  onDelete?: () => void;
  onCancelEvent?: () => void;
  onAdminAction?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Manage event"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={HERO_BUTTON}
      >
        <Ellipsis size={17} strokeWidth={2.6} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Manage event"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute right-0 top-[calc(100%+8px)] z-10 w-[190px] origin-top-right rounded-[14px] border border-line bg-panel p-1.5 shadow-float"
          >
            {onCancelEvent && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onCancelEvent();
                }}
                className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] font-semibold text-ink outline-none transition-colors hover:bg-field focus-visible:bg-field"
              >
                <CalendarX2 size={17} strokeWidth={2.2} aria-hidden />
                Cancel Event
              </button>
            )}
            {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete?.();
              }}
              className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] font-semibold text-coral-text outline-none transition-colors hover:bg-coral-soft focus-visible:bg-coral-soft"
            >
              <Trash2 size={17} strokeWidth={2.2} aria-hidden />
              Delete Event
            </button>
            )}
            {onAdminAction && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onAdminAction();
                }}
                className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] font-semibold text-ink-soft outline-none transition-colors hover:bg-field focus-visible:bg-field"
              >
                <ShieldAlert size={17} strokeWidth={2.2} aria-hidden />
                Admin Event Action
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
