"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, MapPin, TrendingUp, X } from "lucide-react";

import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import { MobileSheet } from "@/components/mobile/MobileSheet";
import { EVENT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DateFilter, EventCategory, MapPill } from "@/types/event";

interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** The same map pill state and handler the desktop pill row uses. */
  activePill: MapPill;
  onPillClick: (pill: MapPill) => void;
  locating?: boolean;
  dateFilter: DateFilter;
  onDateChange: (value: DateFilter) => void;
  categoryFilter: EventCategory | "all";
  onCategoryChange: (value: EventCategory | "all") => void;
}

/** True when any of the secondary filters differs from its default. */
export function secondaryFiltersActive(pill: MapPill, date: DateFilter, category: EventCategory | "all"): boolean {
  return pill !== "trending" || date !== "today" || category !== "all";
}

const OPTION =
  "flex h-11 items-center justify-center gap-2 rounded-[12px] px-3 text-[14px] font-bold transition-colors duration-150";

/**
 * Phone-only home for the filters that the desktop shows as pills: Trending,
 * Near Me, the date and the category menu. Nothing here has its own state.
 */
export function MobileFilterSheet({
  open,
  onClose,
  activePill,
  onPillClick,
  locating,
  dateFilter,
  onDateChange,
  categoryFilter,
  onCategoryChange,
}: MobileFilterSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="filters-backdrop"
            type="button"
            aria-label="Close filters"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-ink/25 tablet:hidden"
          />
          <MobileSheet
            key="filters-sheet"
            label="Filters"
            modal
            dismissible
            onDismiss={onClose}
            initial="expanded"
            peek={96}
            mediumRatio={0.5}
            expandedRatio={0.8}
            className="fixed inset-x-0 bottom-0 z-[71] rounded-b-none pb-[max(12px,env(safe-area-inset-bottom))] tablet:hidden"
          >
            <div className="flex shrink-0 items-center justify-between px-5">
              <h2 className="text-[18px] font-extrabold tracking-[-0.01em] text-ink">Filters</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close filters"
                className="grid h-10 w-10 place-items-center rounded-full bg-field text-ink transition-colors hover:bg-[#e6eaf2]"
              >
                <X size={17} strokeWidth={2.6} />
              </button>
            </div>

            <div data-sheet-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-none px-5 pb-4">
            <p className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-[0.06em] text-faint">Sort</p>
            <div role="radiogroup" aria-label="Sort" className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "trending", label: "Trending", icon: TrendingUp },
                  { id: "nearMe", label: "Near Me", icon: MapPin },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const selected = activePill === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-busy={(id === "nearMe" && locating) || undefined}
                    onClick={() => onPillClick(id)}
                    className={cn(OPTION, selected ? "bg-brand text-white" : "bg-field text-ink-soft")}
                  >
                    <Icon size={16} strokeWidth={2.3} aria-hidden className={cn(id === "nearMe" && locating && "animate-pulse")} />
                    {label}
                  </button>
                );
              })}
            </div>

            <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-[0.06em] text-faint">Date</p>
            <div role="radiogroup" aria-label="Date" className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "any", label: "Any day" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={dateFilter === id}
                  onClick={() => onDateChange(id)}
                  className={cn(OPTION, dateFilter === id ? "bg-brand text-white" : "bg-field text-ink-soft")}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-[0.06em] text-faint">Categories</p>
            <div role="radiogroup" aria-label="Categories" className="grid grid-cols-2 gap-2">
              {(["all", ...EVENT_CATEGORIES] as const).map((value) => {
                const selected = categoryFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onCategoryChange(value)}
                    className={cn(OPTION, "justify-start", selected ? "bg-brand-tint text-brand ring-1 ring-inset ring-brand/30" : "bg-field text-ink-soft")}
                  >
                    {value === "all" ? null : <CategoryGlyph category={value} size={16} />}
                    <span className="truncate">{value === "all" ? "All Categories" : value}</span>
                    {selected && <Check size={15} strokeWidth={2.8} aria-hidden className="ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (activePill !== "trending") onPillClick("trending");
                  onDateChange("today");
                  onCategoryChange("all");
                }}
                className="h-12 rounded-[13px] bg-field text-[15px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2]"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-[13px] bg-brand text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(23_102_232_/_0.26)] transition-colors hover:bg-brand-dark"
              >
                Show results
              </button>
            </div>
            </div>
          </MobileSheet>
        </>
      )}
    </AnimatePresence>
  );
}
