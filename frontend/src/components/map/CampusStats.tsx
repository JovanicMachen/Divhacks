"use client";

import type { ComponentType } from "react";
import { ChevronRight, Radio } from "lucide-react";

import { PeopleIcon, PizzaSliceIcon } from "@/components/icons/CategoryIcons";
import { ACTIVE_ON_CAMPUS } from "@/data/mock-events";
import { formatCount } from "@/lib/utils";

type IconComponent = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

interface Stat {
  value: number;
  label: string;
  icon: IconComponent;
  iconClass: string;
}

/**
 * Floating campus summary bar. Sits above the bottom edge of the map rather
 * than in document flow, so it never pushes the map around. Event counts are
 * derived from the loaded events; "active on campus" has no live source yet.
 */
export function CampusStats({ happeningNow, freeFood }: { happeningNow: number; freeFood: number }) {
  const stats: Stat[] = [
    { value: happeningNow, label: "happening now", icon: Radio, iconClass: "text-[#F5453A]" },
    { value: ACTIVE_ON_CAMPUS, label: "active on campus", icon: PeopleIcon, iconClass: "text-brand" },
    { value: freeFood, label: freeFood === 1 ? "free food event" : "free food events", icon: PizzaSliceIcon, iconClass: "" },
  ];
  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden w-[84%] max-w-[760px] -translate-x-1/2 tablet:block">
      <dl className="pointer-events-auto flex h-[83px] items-stretch overflow-hidden rounded-[20px] bg-panel shadow-float">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 tablet:gap-[15px] tablet:px-[18px]"
              style={
                index > 0
                  ? { borderLeft: "1px solid var(--color-line)" }
                  : undefined
              }
            >
              <Icon
                size={28}
                strokeWidth={2}
                aria-hidden
                className={`shrink-0 ${stat.iconClass}`}
              />
              <div className="min-w-0">
                <dd className="text-[24px] font-extrabold leading-none tracking-[-0.02em] text-ink">
                  {formatCount(stat.value)}
                </dd>
                <dt className="mt-[5px] truncate text-[13.5px] font-medium leading-tight text-muted">
                  {stat.label}
                </dt>
              </div>
              <ChevronRight
                size={18}
                strokeWidth={2.2}
                aria-hidden
                className="ml-auto hidden shrink-0 text-faint tablet:block"
              />
            </div>
          );
        })}
      </dl>
    </div>
  );
}
