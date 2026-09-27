"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Radar, SlidersHorizontal } from "lucide-react";

import { CategoryGlyph, HouseIcon } from "@/components/icons/CategoryIcons";
import { useDragScroll } from "@/lib/use-drag-scroll";
import { cn } from "@/lib/utils";
import type { EventCategory } from "@/types/event";

/** What a chip filters: every live event, a category, or Rallies only. */
export type LiveFilter = "all" | "events" | "rally" | EventCategory;

const CHIPS: Array<{ id: LiveFilter; label: string }> = [
  { id: "all", label: "Happening" },
  { id: "rally", label: "Rally" },
  { id: "Free Food", label: "Free Food" },
  { id: "Social", label: "Social" },
  { id: "Academic", label: "Academic" },
  { id: "Sports", label: "Sports" },
  { id: "Career", label: "Career" },
  { id: "Entertainment", label: "Entertainment" },
];

interface MobileCategoryChipsProps {
  active: LiveFilter;
  onChange: (filter: LiveFilter) => void;
  /** Opens the sheet with Trending, Near Me, date and category menu. */
  onOpenFilters: () => void;
  /** Shows a dot on the Filters button when any of those differ from their defaults. */
  filtersActive: boolean;
}

/**
 * The one filter strip over the map on phones: a Filters button, then the live
 * categories. The desktop pill row and sidebar are unchanged.
 */
export function MobileCategoryChips({ active, onChange, onOpenFilters, filtersActive }: MobileCategoryChipsProps) {
  const rowRef = useDragScroll<HTMLDivElement>();
  const chipRefs = useRef(new Map<LiveFilter, HTMLButtonElement>());
  const reduceMotion = useReducedMotion();

  // Keep the selected chip in view when it changes (including from the live panel).
  useEffect(() => {
    chipRefs.current.get(active)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [active, reduceMotion]);

  return (
    <div className="absolute left-0 right-0 top-3 z-10 flex items-center gap-[6px] pl-3 tablet:hidden">
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={filtersActive ? "Filters (some applied)" : "Filters"}
        aria-haspopup="dialog"
        className="relative grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border border-line bg-panel text-ink-soft shadow-pill transition-colors active:bg-brand-tint"
      >
        <SlidersHorizontal size={17} strokeWidth={2.3} aria-hidden />
        {filtersActive && (
          <span aria-hidden className="absolute right-[5px] top-[5px] h-2 w-2 rounded-full bg-brand ring-2 ring-panel" />
        )}
      </button>
    <div ref={rowRef} role="group" aria-label="Categories" className="cc-chip-row min-w-0 flex-1 pr-3">
      <div className="flex w-max gap-[6px] py-[2px]">
        {CHIPS.map((chip) => {
          const selected = chip.id === active;
          return (
            <button
              key={chip.id}
              ref={(el) => {
                if (el) chipRefs.current.set(chip.id, el);
                else chipRefs.current.delete(chip.id);
              }}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(chip.id)}
              className={cn(
                "relative flex h-[38px] shrink-0 items-center gap-[5px] rounded-full px-[11px] text-[13px] font-semibold shadow-pill transition-colors duration-200",
                selected ? "text-white" : "border border-line bg-panel text-ink-soft",
              )}
            >
              {selected && (
                <motion.span
                  layoutId="mobile-category-chip"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: chip.id === "rally" ? "#0f2547" : "#1766e8" }}
                />
              )}
              <span className="relative flex items-center gap-[5px]">
                {chip.id === "all" ? (
                  <HouseIcon size={15} className={selected ? "text-white" : "text-brand"} />
                ) : chip.id === "rally" || chip.id === "events" ? (
                  <Radar size={14} strokeWidth={2.4} aria-hidden />
                ) : (
                  <CategoryGlyph category={chip.id} size={15} />
                )}
                {chip.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
    </div>
  );
}
