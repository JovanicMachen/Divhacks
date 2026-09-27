"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Radar } from "lucide-react";

import { CategoryGlyph, HouseIcon } from "@/components/icons/CategoryIcons";
import { useDragScroll } from "@/lib/use-drag-scroll";
import { cn } from "@/lib/utils";
import type { EventCategory } from "@/types/event";

/** What a chip filters: every live event, a category, or Rallies only. */
export type LiveFilter = "all" | "events" | "rally" | EventCategory;

const CHIPS: Array<{ id: LiveFilter; label: string }> = [
  { id: "all", label: "Happening" },
  { id: "Free Food", label: "Free Food" },
  { id: "rally", label: "Rally" },
  { id: "Social", label: "Social" },
  { id: "Academic", label: "Academic" },
  { id: "Sports", label: "Sports" },
  { id: "Career", label: "Career" },
  { id: "Entertainment", label: "Entertainment" },
];

interface MobileCategoryChipsProps {
  active: LiveFilter;
  onChange: (filter: LiveFilter) => void;
}

/** Phone-only category row under the map pills; the desktop sidebar is unchanged. */
export function MobileCategoryChips({ active, onChange }: MobileCategoryChipsProps) {
  const rowRef = useDragScroll<HTMLDivElement>();
  const chipRefs = useRef(new Map<LiveFilter, HTMLButtonElement>());
  const reduceMotion = useReducedMotion();

  // Keep the selected chip in view when it changes (including from the live panel).
  useEffect(() => {
    chipRefs.current.get(active)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [active, reduceMotion]);

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Categories"
      className="cc-chip-row absolute left-0 right-0 top-[62px] z-10 px-3 tablet:hidden"
    >
      <div className="flex w-max gap-[6px] pb-1">
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
                "relative flex h-[34px] shrink-0 items-center gap-[5px] rounded-full px-[11px] text-[13px] font-semibold shadow-pill transition-colors duration-200",
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
  );
}
