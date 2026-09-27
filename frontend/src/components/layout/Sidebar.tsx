"use client";

import type { ComponentType } from "react";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";

import {
  BasketballIcon,
  BookmarkIcon,
  BriefcaseIcon,
  HouseIcon,
  OpenBookIcon,
  PeopleIcon,
  PizzaSliceIcon,
} from "@/components/icons/CategoryIcons";
import { cn } from "@/lib/utils";
import type { SidebarFilter } from "@/types/event";

type IconComponent = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

interface NavItem {
  label: string;
  filter: SidebarFilter;
  icon: IconComponent;
  /** Tint for the single-colour glyphs; the illustrated ones carry their own. */
  iconClass: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Happening Now", filter: "all", icon: HouseIcon, iconClass: "text-brand" },
  { label: "Free Food", filter: "Free Food", icon: PizzaSliceIcon, iconClass: "" },
  { label: "Social", filter: "Social", icon: PeopleIcon, iconClass: "text-[#A24BEE]" },
  { label: "Academic", filter: "Academic", icon: OpenBookIcon, iconClass: "" },
  { label: "Career", filter: "Career", icon: BriefcaseIcon, iconClass: "" },
  { label: "Sports", filter: "Sports", icon: BasketballIcon, iconClass: "" },
  { label: "Saved", filter: "saved", icon: BookmarkIcon, iconClass: "text-[#3B4A66]" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  selected: SidebarFilter;
  onSelect: (filter: SidebarFilter) => void;
  savedCount: number;
  onPostEvent: () => void;
  /** Shown under Post Event: the Ask Gemini panel, or the button that opens it. */
  assistant?: React.ReactNode;
}

/** Category rail: filters the events shown on the map. */
export function Sidebar({
  isOpen,
  onClose,
  selected: selectedFilter,
  onSelect,
  savedCount,
  onPostEvent,
  assistant,
}: SidebarProps) {
  return (
    <aside
      aria-label="Event categories"
      className={cn(
        "fixed bottom-0 left-0 top-[72px] z-[60] flex w-[276px] shrink-0 flex-col overflow-y-auto border-r border-line-strong bg-rail px-4 pt-4 shadow-float transition-transform duration-200 ease-out scrollbar-none",
        "tablet:static tablet:z-auto tablet:w-[236px] tablet:translate-x-0 tablet:px-3.5 tablet:shadow-none desktop:w-[276px] desktop:px-4",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation menu"
        className="mb-2 ml-auto grid h-9 w-9 place-items-center rounded-[10px] text-ink-soft transition-colors duration-150 hover:bg-brand-tint hover:text-brand tablet:hidden"
      >
        <X size={19} strokeWidth={2.2} />
      </button>

      <nav className="flex flex-col gap-[5px]">
        {NAV_ITEMS.map((item) => {
          const selected = item.filter === selectedFilter;
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onSelect(item.filter)}
              className={cn(
                "flex h-[49px] items-center gap-[18px] rounded-[13px] px-[18px] text-left text-[15.5px] transition-colors duration-150 ease-out",
                selected
                  ? "bg-brand-tint font-bold text-brand"
                  : "font-semibold text-ink hover:bg-[#f0f3f9]",
              )}
            >
              <Icon size={25} aria-hidden className={cn("shrink-0", item.iconClass)} />
              <span className="truncate">{item.label}</span>
              {item.filter === "saved" && savedCount > 0 && (
                <span className="ml-auto rounded-full bg-brand-tint px-2 py-[1px] text-[12px] font-bold text-brand">
                  {savedCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <motion.button
        type="button"
        onClick={onPostEvent}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="mt-[21px] flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[16px] font-bold text-white shadow-[0_6px_16px_rgb(23_102_232_/_0.28)] transition-colors duration-150 hover:bg-brand-dark active:bg-brand-press"
      >
        <Plus size={19} strokeWidth={2.8} aria-hidden />
        Post Event
      </motion.button>

      {assistant && <div className="mt-3 flex min-h-0 flex-1 flex-col pb-4">{assistant}</div>}
    </aside>
  );
}
