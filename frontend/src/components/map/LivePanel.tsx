"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronUp, Radar } from "lucide-react";

import { CountdownChip } from "@/components/events/CountdownChip";
import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import { MobileSheet, type MobileSheetHandle, type SheetDetent } from "@/components/mobile/MobileSheet";
import type { LiveFilter } from "./MobileCategoryChips";
import { useLifecycleNow } from "@/lib/event-clock";
import { isHappeningNow } from "@/lib/use-campus-state";
import { useDragScroll } from "@/lib/use-drag-scroll";
import { cn } from "@/lib/utils";
import type { CampusEvent, EventCategory } from "@/types/event";

/** Height of the collapsed bar that stays above the bottom edge, including the drag handle. */
const PEEK = 86;

const FILTERS: Array<{ id: LiveFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "events", label: "Events" },
  { id: "rally", label: "Rally" },
  { id: "Free Food", label: "Free Food" },
  { id: "Social", label: "Social" },
  { id: "Academic", label: "Academic" },
  { id: "Sports", label: "Sports" },
];

const COUNTED: EventCategory[] = ["Free Food", "Social", "Academic", "Sports", "Career", "Entertainment"];

export function matchesLiveFilter(event: CampusEvent, filter: LiveFilter): boolean {
  if (filter === "all") return true;
  if (filter === "rally") return event.kind === "rally";
  if (filter === "events") return event.kind !== "rally";
  return event.category === filter;
}

interface LivePanelProps {
  /** Events still on the live map (not ended, cancelled, or expired). */
  events: CampusEvent[];
  filter: LiveFilter;
  onFilterChange: (filter: LiveFilter) => void;
  onOpenEvent: (event: CampusEvent) => void;
}

/**
 * Phone-only bottom sheet. Collapsed it shows live counts; tap or swipe up for
 * the breakdown and cards, swipe down to put it away. Every number is counted
 * from the events currently loaded, so realtime changes update it.
 */
export function LivePanel({ events, filter, onFilterChange, onOpenEvent }: LivePanelProps) {
  const [detent, setDetent] = useState<SheetDetent>("peek");
  const sheetRef = useRef<MobileSheetHandle>(null);
  const reduceMotion = useReducedMotion();
  const filterRow = useDragScroll<HTMLDivElement>();
  const now = useLifecycleNow(events);
  const open = detent !== "peek";

  const live = useMemo(
    () =>
      events
        .filter((event) => (event.rally ? event.rally.status !== "expired" : isHappeningNow(event, now)))
        .sort((a, b) => (a.endsAt ?? "~").localeCompare(b.endsAt ?? "~")),
    [events, now],
  );
  const counts = useMemo(() => {
    const byCategory = new Map<EventCategory, number>();
    for (const event of live) byCategory.set(event.category, (byCategory.get(event.category) ?? 0) + 1);
    return { byCategory, rallies: live.filter((e) => e.kind === "rally").length };
  }, [live]);
  const cards = live.filter((event) => matchesLiveFilter(event, filter));

  const cycle = () => {
    const order: SheetDetent[] = ["peek", "medium", "expanded"];
    const next = order[(order.indexOf(detent) + 1) % order.length];
    sheetRef.current?.snap(next);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            key="live-backdrop"
            type="button"
            aria-label="Close campus live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => sheetRef.current?.snap("peek")}
            className="absolute inset-0 z-[29] bg-ink/20 tablet:hidden"
          />
        )}
      </AnimatePresence>
      <MobileSheet
        ref={sheetRef}
        label="Campus live"
        initial="peek"
        peek={PEEK}
        mediumRatio={0.46}
        expandedRatio={0.72}
        maxHeight={600}
        enter={false}
        onDetentChange={setDetent}
        className="absolute inset-x-2 bottom-2 z-30 shadow-[0_-4px_24px_rgba(15,37,71,0.14),0_12px_28px_rgba(15,37,71,0.12)] tablet:hidden"
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={cycle}
          className="flex h-[58px] w-full shrink-0 items-center px-4 text-left"
        >
          {/* Counted from the loaded events: live now, still on the map, and Rallies. */}
          <span className="flex w-full min-w-0 items-center gap-2 whitespace-nowrap text-[13.5px] font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <span className="cc-live-dot h-2 w-2 rounded-full bg-[#F5453A]" aria-hidden />
              <span className="tabular-nums">{live.length}</span> live
            </span>
            <span aria-hidden className="text-faint">·</span>
            <span className="truncate font-semibold text-ink-soft">
              <span className="font-bold tabular-nums text-ink">{events.length}</span>{" "}
              {events.length === 1 ? "event" : "events"} available
            </span>
            <span aria-hidden className="text-faint">·</span>
            <span className="font-semibold text-ink-soft">
              <span className="font-bold tabular-nums text-ink">{counts.rallies}</span> {counts.rallies === 1 ? "Rally" : "Rallies"}
            </span>
            <ChevronUp
              size={18}
              strokeWidth={2.4}
              aria-hidden
              className={cn("ml-auto text-faint transition-transform duration-300", open && "rotate-180")}
            />
          </span>
        </button>

        <div className="flex min-h-0 flex-1 flex-col" aria-hidden={!open} inert={!open || undefined}>
          <div className="shrink-0 px-5">
            <p className="text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-faint">Campus live</p>
            <p className="mt-[2px] text-[20px] font-extrabold tracking-[-0.02em] text-ink">
              {live.length} {live.length === 1 ? "event" : "events"} active now
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5">
              {COUNTED.map((category) => (
                <div key={category} className="flex items-center justify-between text-[13.5px]">
                  <dt className="flex items-center gap-1.5 font-semibold text-ink-soft">
                    <CategoryGlyph category={category} size={14} />
                    {category}
                  </dt>
                  <dd className="font-bold tabular-nums text-ink">{counts.byCategory.get(category) ?? 0}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between text-[13.5px]">
                <dt className="flex items-center gap-1.5 font-semibold text-ink-soft">
                  <Radar size={14} strokeWidth={2.4} aria-hidden className="text-ink" />
                  Rally
                </dt>
                <dd className="font-bold tabular-nums text-ink">{counts.rallies}</dd>
              </div>
            </dl>
          </div>

          <div ref={filterRow} role="group" aria-label="Filter live events" className="cc-chip-row mt-3 shrink-0 px-4">
            <div className="flex w-max gap-1.5 pb-1">
              {FILTERS.map((option) => {
                const selected = option.id === filter;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onFilterChange(option.id)}
                    className={cn(
                      "relative h-[34px] shrink-0 rounded-full px-[12px] text-[13px] font-bold transition-colors",
                      selected ? "text-white" : "bg-field text-ink-soft",
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId="live-panel-filter"
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                        className="absolute inset-0 rounded-full bg-brand"
                      />
                    )}
                    <span className="relative">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-3 shrink-0 px-5 text-[13px] font-extrabold text-ink">Happening now</p>
          <ul data-sheet-scroll="" className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-none px-3 pb-4 pt-2">
            {cards.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13.5px] font-medium text-muted">Nothing live for this filter right now.</li>
            ) : (
              cards.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => {
                      sheetRef.current?.snap("peek");
                      onOpenEvent(event);
                    }}
                    className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-panel p-2.5 text-left transition-colors active:bg-brand-tint"
                  >
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px]",
                        event.kind === "rally" ? "bg-ink text-white" : "bg-field",
                      )}
                    >
                      {event.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={event.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : event.kind === "rally" ? (
                        <Radar size={19} strokeWidth={2.4} aria-hidden />
                      ) : (
                        <CategoryGlyph category={event.category} size={20} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-ink">{event.title}</span>
                      <span className="block truncate text-[12.5px] font-medium text-muted">
                        {event.locationName} · {event.category}
                      </span>
                    </span>
                    <CountdownChip event={event} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </MobileSheet>
    </>
  );
}
