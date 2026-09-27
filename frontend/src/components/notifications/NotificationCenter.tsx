"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { MobileSheet } from "@/components/mobile/MobileSheet";
import {
  Bell,
  BellRing,
  Bookmark,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  CheckCheck,
  Megaphone,
  Radar,
  TimerOff,
  type LucideIcon,
} from "lucide-react";

import { CountdownChip } from "@/components/events/CountdownChip";
import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import { useMediaQuery } from "@/lib/use-media-query";
import { useNotifications } from "@/lib/notifications";
import type { NotificationRow } from "@/lib/notifications-backend";
import { ageLabel, liveStatus, priorityOf } from "@/lib/smart-notifications";
import { useUserEvents } from "@/lib/user-events";
import { cn } from "@/lib/utils";
import type { CampusEvent, EventCategory } from "@/types/event";

const TYPE_ICON: Record<string, LucideIcon> = {
  event_cancelled: CalendarX2,
  rally_on: Radar,
  rally_expired: TimerOff,
  going_starting_now: BellRing,
  going_starts_soon: CalendarClock,
  saved_starts_soon: Bookmark,
  category_starts_soon: CalendarClock,
  new_event: CalendarPlus,
  official_added: Megaphone,
};

/** Types whose body text is the message itself, not "title · place". */
const BODY_TYPES = new Set(["event_cancelled", "rally_on", "rally_expired"]);

interface NotificationCenterProps {
  /** Selects the event, focuses its marker, and opens the event drawer. */
  onOpenEvent: (event: CampusEvent) => void;
}

/** Unread first (most relevant, then newest), then read ones by recency. */
function ordered(rows: NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    if (!a.read_at !== !b.read_at) return a.read_at ? 1 : -1;
    if (!a.read_at) {
      const byPriority = priorityOf(a.type) - priorityOf(b.type);
      if (byPriority !== 0) return byPriority;
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

export function NotificationCenter({ onOpenEvent }: NotificationCenterProps) {
  const { notifications, unreadCount, markRead, markAllRead, storage, now } = useNotifications();
  const { events } = useUserEvents();
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const isSheet = useMediaQuery("(max-width: 899px)");

  const byId = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const rows = useMemo(() => ordered(notifications), [notifications]);

  const close = useCallback((restoreFocus = false) => {
    setOpenAt(null);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const openNotification = (row: NotificationRow) => {
    markRead(row.id);
    const event = row.event_id ? byId.get(row.event_id) : undefined;
    if (!event) return;
    close();
    onOpenEvent(event);
  };

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <div className="relative">
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={() => setOpenAt(open ? null : pathname)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-full text-brand transition-colors duration-150 hover:bg-brand-tint",
          open && "bg-brand-tint",
        )}
      >
        <Bell size={21} strokeWidth={2.1} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key={unreadCount}
              aria-hidden
              initial={{ scale: 1.35 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute right-[3px] top-[3px] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#F5453A] px-[4px] text-[10.5px] font-bold leading-none text-white ring-2 ring-panel"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {isSheet && (
              <motion.div
                key="backdrop"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 bg-ink/30"
              />
            )}
            {isSheet ? (
              <MobileSheet
                key="panel"
                nodeRef={panelRef}
                id={panelId}
                label="Notifications"
                modal
                dismissible
                onDismiss={() => close()}
                initial="expanded"
                peek={120}
                mediumRatio={0.55}
                expandedRatio={0.86}
                className="fixed inset-x-0 bottom-0 z-[60] rounded-b-none pb-[max(8px,env(safe-area-inset-bottom))]"
              >
                <NoticeBody
                  rows={rows}
                  byId={byId}
                  now={now}
                  unreadCount={unreadCount}
                  storage={storage}
                  onOpen={openNotification}
                  onMarkRead={markRead}
                  onMarkAllRead={markAllRead}
                />
              </MobileSheet>
            ) : (
            <motion.div
              key="panel"
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label="Notifications"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
              className="absolute right-0 top-[calc(100%+10px)] flex max-h-[min(560px,calc(100vh-96px))] w-[380px] origin-top-right flex-col rounded-[18px] border border-line bg-panel shadow-float"
            >
              <NoticeBody
                rows={rows}
                byId={byId}
                now={now}
                unreadCount={unreadCount}
                storage={storage}
                onOpen={openNotification}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
              />
            </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NoticeBody({
  rows,
  byId,
  now,
  unreadCount,
  storage,
  onOpen,
  onMarkRead,
  onMarkAllRead,
}: {
  rows: NotificationRow[];
  byId: Map<string, CampusEvent>;
  now: number;
  unreadCount: number;
  storage: "database" | "browser" | "session";
  onOpen: (row: NotificationRow) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2.5 pt-3.5">
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Notifications</h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-bold text-brand transition-colors hover:bg-brand-tint disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent"
        >
          <CheckCheck size={15} strokeWidth={2.4} aria-hidden />
          Mark all as read
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center px-6 pb-10 pt-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-tint text-brand">
            <Bell size={22} strokeWidth={2.1} aria-hidden />
          </span>
          <p className="mt-3 text-[15.5px] font-bold text-ink">You&apos;re all caught up</p>
          <p className="mt-1 text-[13.5px] font-medium text-muted">New campus activity will appear here.</p>
        </div>
      ) : (
        <ul data-sheet-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-none px-2 pb-2 scrollbar-none">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <NotificationItem
                key={row.id}
                row={row}
                event={row.event_id ? byId.get(row.event_id) : undefined}
                now={now}
                onOpen={() => onOpen(row)}
                onMarkRead={() => onMarkRead(row.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {storage !== "database" && (
        <p className="shrink-0 border-t border-line px-4 py-2.5 text-[12px] font-medium leading-[1.4] text-faint">
          {storage === "browser"
            ? "Local preview: notifications are kept in this browser."
            : "Notifications aren't saved yet. Run the notifications migration to keep them across devices."}
        </p>
      )}
    </>
  );
}

interface ItemProps {
  row: NotificationRow;
  event: CampusEvent | undefined;
  now: number;
  onOpen: () => void;
  onMarkRead: () => void;
}

function NotificationItem({ row, event, now, onOpen, onMarkRead }: ItemProps) {
  const unread = !row.read_at;
  const status = liveStatus(row.event_id ? event : undefined, now);
  const category = (event?.category ?? (row.metadata?.category as EventCategory | undefined)) ?? null;
  const Icon = TYPE_ICON[row.type];
  const isFood = row.type === "free_food_posted" || row.type === "free_food_now";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8, backgroundColor: "rgba(234,241,253,1)" }}
      animate={{ opacity: 1, y: 0, backgroundColor: "rgba(234,241,253,0)" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", backgroundColor: { duration: 1.6 } }}
      className="group relative rounded-[13px]"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-disabled={!status.available}
        className={cn(
          "flex w-full items-start gap-3 rounded-[13px] px-2.5 py-2.5 pr-10 text-left transition-colors duration-100",
          status.available ? "hover:bg-[#f5f7fb]" : "cursor-default",
        )}
      >
        <span
          className={cn(
            "mt-[1px] grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full",
            isFood ? "bg-coral-soft" : "bg-brand-tint text-brand",
          )}
        >
          {event?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : isFood || (!Icon && category) ? (
            <CategoryGlyph category={category ?? "Free Food"} size={20} />
          ) : Icon ? (
            <Icon size={19} strokeWidth={2.2} aria-hidden />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[14px] leading-[1.3] text-ink", unread ? "font-bold" : "font-semibold text-ink-soft")}>
            {row.title}
          </span>
          {BODY_TYPES.has(row.type) && row.body ? (
            <span className="mt-[2px] block text-[13px] font-semibold leading-[1.35] text-ink-soft">{row.body}</span>
          ) : (
            event && <span className="mt-[2px] block truncate text-[13px] font-semibold text-ink-soft">{event.title}</span>
          )}
          {event && <CountdownChip event={event} hideEnded className="mt-[5px]" />}
          <span className={cn("mt-[2px] block text-[12.5px] font-medium", status.available ? "text-muted" : "text-faint")}>
            {status.text} · {ageLabel(row.created_at, now)}
          </span>
        </span>
      </button>
      {unread ? (
        <button
          type="button"
          onClick={onMarkRead}
          aria-label={`Mark "${row.title}" as read`}
          className="absolute right-2 top-3 grid h-7 w-7 place-items-center rounded-full text-brand transition-colors hover:bg-brand-tint"
        >
          <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-brand group-hover:hidden group-focus-within:hidden" />
          <Check size={15} strokeWidth={2.6} aria-hidden className="hidden group-hover:block group-focus-within:block" />
        </button>
      ) : null}
    </motion.li>
  );
}
