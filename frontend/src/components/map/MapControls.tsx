"use client";

import { motion } from "framer-motion";
import { Minus, Navigation, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Recentre on the user (asks for location on first use). */
  onLocate: () => void;
  locating?: boolean;
  /** True once the view is following a granted location. */
  located?: boolean;
}

/** Locate + zoom controls pinned to the lower-left of the map. */
export function MapControls({ onZoomIn, onZoomOut, onLocate, locating, located }: MapControlsProps) {
  return (
    <div className="absolute bottom-[103px] left-[17px] z-10 flex flex-col gap-[15px]">
      <motion.button
        type="button"
        onClick={onLocate}
        aria-label="Recentre map on my location"
        aria-busy={locating || undefined}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className={cn(
          "grid h-[46px] w-[46px] place-items-center rounded-xl border border-line bg-panel shadow-pill transition-colors duration-150 hover:text-brand",
          located ? "text-brand" : "text-[#3C4C6B]",
        )}
      >
        <Navigation
          size={19}
          strokeWidth={2.2}
          className={cn(located && "fill-brand", locating && "animate-pulse")}
        />
      </motion.button>

      {/* Phones: two separate 44px buttons with a gap. Tablet and up: the joined control. */}
      <div className="flex flex-col gap-[12px] tablet:gap-0 tablet:overflow-hidden tablet:rounded-xl tablet:border tablet:border-line tablet:bg-panel tablet:shadow-pill">
        <ZoomButton label="Zoom in" onClick={onZoomIn}>
          <Plus size={18} strokeWidth={2.4} />
        </ZoomButton>
        <span aria-hidden className="mx-auto hidden h-px w-[26px] bg-line tablet:block" />
        <ZoomButton label="Zoom out" onClick={onZoomOut}>
          <Minus size={18} strokeWidth={2.4} />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-[44px] w-[46px] place-items-center rounded-xl border border-line bg-panel text-[#3C4C6B] shadow-pill transition-colors duration-150 hover:bg-brand-tint hover:text-brand active:bg-brand-soft tablet:h-[34px] tablet:rounded-none tablet:border-0 tablet:bg-transparent tablet:shadow-none"
    >
      {children}
    </button>
  );
}
