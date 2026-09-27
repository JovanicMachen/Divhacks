"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, ChevronDown, Grid2x2, MapPin, TrendingUp } from "lucide-react";

import { PizzaSliceIcon } from "@/components/icons/CategoryIcons";
import { EVENT_CATEGORIES } from "@/lib/constants";
import { useDragScroll } from "@/lib/use-drag-scroll";
import { cn } from "@/lib/utils";
import type { DateFilter, EventCategory, MapPill } from "@/types/event";

type IconComponent = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

interface MapFiltersProps {
  activePill: MapPill;
  onPillClick: (pill: MapPill) => void;
  /** True while Near Me is waiting on the browser location prompt. */
  locating?: boolean;
  dateFilter: DateFilter;
  onDateChange: (value: DateFilter) => void;
  categoryFilter: EventCategory | "all";
  onCategoryChange: (value: EventCategory | "all") => void;
}

const PILLS: Array<{ id: MapPill; label: string; icon: IconComponent }> = [
  { id: "trending", label: "Trending", icon: TrendingUp },
  { id: "nearMe", label: "Near Me", icon: MapPin },
  { id: "freeFood", label: "Free Food", icon: PizzaSliceIcon },
];

// Phones get slightly smaller pills so more fit; tablet and up keep the approved sizes.
const PILL_BASE =
  "flex h-[38px] shrink-0 items-center gap-[6px] rounded-full px-[11px] text-[13.5px] font-semibold transition-shadow duration-150 tablet:h-[42px] tablet:gap-[7px] tablet:px-[13px] tablet:text-[14px]";
const PILL_ACTIVE =
  "bg-brand text-white shadow-[0_2px_6px_rgba(23,102,232,0.28),0_8px_18px_rgba(23,102,232,0.2)] hover:shadow-[0_3px_8px_rgba(23,102,232,0.32),0_12px_24px_rgba(23,102,232,0.24)]";
const PILL_IDLE = "border border-line bg-panel text-ink-soft shadow-pill hover:shadow-pill-hover";

/** Floating filter row over the top of the map. */
export function MapFilters({
  activePill,
  onPillClick,
  locating,
  dateFilter,
  onDateChange,
  categoryFilter,
  onCategoryChange,
}: MapFiltersProps) {
  const rowRef = useDragScroll<HTMLDivElement>();
  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Event filters"
      className="cc-chip-row pointer-events-none absolute left-0 right-0 top-4 z-10 hidden px-3 tablet:block tablet:px-[24px]"
    >
      <div className="pointer-events-auto flex w-max gap-2 pb-1 tablet:gap-[22px]">
        {PILLS.map((pill) => {
          const active = pill.id === activePill;
          const Icon = pill.icon;
          return (
            <motion.button
              key={pill.id}
              type="button"
              aria-pressed={active}
              aria-busy={(pill.id === "nearMe" && locating) || undefined}
              onClick={() => onPillClick(pill.id)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97, y: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_IDLE)}
            >
              <Icon
                size={16}
                strokeWidth={2.3}
                className={cn(
                  active ? "text-white" : "text-brand",
                  pill.id === "nearMe" && locating && "animate-pulse",
                )}
              />
              {pill.label}
            </motion.button>
          );
        })}

        <FilterMenu
          icon={CalendarDays}
          label={dateFilter === "today" ? "Today" : "Any day"}
          active={false}
          options={[
            { value: "today", label: "Today" },
            { value: "any", label: "Any day" },
          ]}
          value={dateFilter}
          onChange={(v) => onDateChange(v as DateFilter)}
        />

        <FilterMenu
          icon={Grid2x2}
          label={categoryFilter === "all" ? "All Categories" : categoryFilter}
          active={categoryFilter !== "all"}
          options={[
            { value: "all", label: "All Categories" },
            ...EVENT_CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
          value={categoryFilter}
          onChange={(v) => onCategoryChange(v as EventCategory | "all")}
        />
      </div>
    </div>
  );
}

/**
 * Pill with a small option menu. The menu is fixed-positioned because the
 * pill row scrolls horizontally on narrow screens and would clip it.
 */
function FilterMenu({
  icon: Icon,
  label,
  active,
  options,
  value,
  onChange,
}: {
  icon: IconComponent;
  label: string;
  active: boolean;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 8, left: rect.left });
    setOpen((o) => !o);
  };

  return (
    <>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_IDLE)}
      >
        <Icon size={16} strokeWidth={2.3} className={active ? "text-white" : "text-brand"} />
        {label}
        <ChevronDown
          size={14}
          strokeWidth={2.4}
          aria-hidden
          className={cn(
            "-ml-[2px] -mr-[2px] transition-transform duration-150",
            active ? "text-white/80" : "text-faint",
            open && "rotate-180",
          )}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="fixed z-50 min-w-[190px] rounded-[14px] border border-line bg-panel p-1.5 shadow-float"
            style={{ top: pos.top, left: pos.left }}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-9 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-left text-[14px] font-semibold transition-colors duration-100",
                    selected ? "bg-brand-tint text-brand" : "text-ink-soft hover:bg-[#f0f3f9]",
                  )}
                >
                  {option.label}
                  {selected && <Check size={15} strokeWidth={2.6} aria-hidden />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
