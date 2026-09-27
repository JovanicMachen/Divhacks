"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
import { ChevronUp, Radar } from "lucide-react";

import { CountdownChip } from "@/components/events/CountdownChip";
import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import type { LiveFilter } from "./MobileCategoryChips";
import { useLifecycleNow } from "@/lib/event-clock";
import { isHappeningNow } from "@/lib/use-campus-state";
import { useDragScroll } from "@/lib/use-drag-scroll";
import { cn } from "@/lib/utils";
import type { CampusEvent, EventCategory } from "@/types/event";

/** Height of the collapsed bar that stays above the bottom edge. */
const PEEK = 64;
const SWIPE_DISTANCE = 36;
const SWIPE_VELOCITY = 320;

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
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
  const filterRow = useDragScroll<HTMLDivElement>();
  const now = useLifecycleNow(events);

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  const freeFood = counts.byCategory.get("Free Food") ?? 0;

  // The sheet floats 8px above the edge; drop it by that much so only the bar shows.
  const collapsedY = Math.max(0, height - PEEK + 8);
  const spring = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 38 };

  return (
    <>
      <AnimatePresence>
        {expanded && (
          <motion.button
            key="live-backdrop"
            type="button"
            aria-label="Close campus live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpanded(false)}
            className="absolute inset-0 z-[29] bg-ink/20 tablet:hidden"
          />
        )}
      </AnimatePresence>
      <motion.section
        ref={sheetRef}
        aria-label="Campus live"
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: collapsedY }}
        dragElastic={0.06}
        dragMomentum={false}
        initial={false}
        animate={{ y: expanded ? 0 : collapsedY, opacity: height ? 1 : 0 }}
        transition={spring}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          if (info.offset.y < -SWIPE_DISTANCE || info.velocity.y < -SWIPE_VELOCITY) setExpanded(true);
          else if (info.offset.y > SWIPE_DISTANCE || info.velocity.y > SWIPE_VELOCITY) setExpanded(false);
          else setExpanded((open) => open);
        }}
        className="absolute inset-x-2 bottom-2 z-30 flex h-[min(72vh,600px)] flex-col overflow-hidden rounded-[22px] bg-panel shadow-[0_-4px_24px_rgba(15,37,71,0.14),0_12px_28px_rgba(15,37,71,0.12)] tablet:hidden"
      >
        <button
          type="button"
          aria-expanded={expanded}
          onPointerDown={(e) => {
            dragged.current = false;
            controls.start(e);
          }}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            setExpanded((open) => !open);
          }}
          style={{ touchAction: "none" }}
          className="flex h-[64px] w-full shrink-0 flex-col items-center justify-center px-4 text-left"
        >
          <span aria-hidden className="mb-[7px] block h-1 w-9 rounded-full bg-line-strong" />
          <span className="flex w-full items-center gap-2.5 text-[14px] font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <span className="cc-live-dot h-2 w-2 rounded-full bg-[#F5453A]" aria-hidden />
              <span className="tabular-nums">{live.length}</span> live
            </span>
            <span aria-hidden className="text-faint">·</span>
            <span className="flex items-center gap-1 font-semibold text-ink-soft">
              Free Food <span className="font-bold tabular-nums text-ink">{freeFood}</span>
            </span>
            <span aria-hidden className="text-faint">·</span>
            <span className="flex items-center gap-1 font-semibold text-ink-soft">
              Rally <span className="font-bold tabular-nums text-ink">{counts.rallies}</span>
            </span>
            <ChevronUp
              size={18}
              strokeWidth={2.4}
              aria-hidden
              className={cn("ml-auto text-faint transition-transform duration-300", expanded && "rotate-180")}
            />
          </span>
        </button>

        <div className="flex min-h-0 flex-1 flex-col" aria-hidden={!expanded} inert={!expanded || undefined}>
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
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
            {cards.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13.5px] font-medium text-muted">Nothing live for this filter right now.</li>
            ) : (
              cards.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(false);
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
      </motion.section>
    </>
  );
}
