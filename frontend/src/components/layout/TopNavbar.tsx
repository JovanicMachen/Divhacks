"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Menu, Search, X } from "lucide-react";

import { AccountMenu } from "@/components/account/AccountMenu";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import type { CampusEvent } from "@/types/event";

interface SearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Events matching the current query and filters. */
  results: CampusEvent[];
  onSelectResult: (event: CampusEvent) => void;
}

interface TopNavbarProps extends SearchProps {
  /** Omitted on pages without the sidebar, where the brand links back to the map. */
  onOpenSidebar?: () => void;
}

/**
 * Fixed-height application header: brand block, local event search and the
 * account cluster. Search only looks at events already in the browser.
 */
export function TopNavbar({ onOpenSidebar, ...search }: TopNavbarProps) {
  const brand = (
    <>
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center text-brand">
        <Crown size={27} strokeWidth={1.6} className="fill-brand" />
      </span>

      <span className="min-w-0 leading-none">
        <span className="block truncate text-[22px] font-extrabold tracking-[-0.02em] text-ink">
          Campus Connect
        </span>
        <span className="mt-[3px] block truncate text-[12.5px] font-medium text-muted">
          Columbia University
        </span>
      </span>
    </>
  );

  return (
    // Above the drawer (z-20) and mobile sheet (z-40) so the account menu can overlap them.
    <header className="z-[45] flex h-[72px] shrink-0 items-center border-b border-line bg-panel">
      <div className="flex w-[196px] shrink-0 items-center gap-2 pl-4 tablet:w-[236px] tablet:gap-2.5 tablet:pl-5 desktop:w-[276px]">
        {onOpenSidebar ? (
          <>
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open navigation menu"
              className="-ml-1 grid h-9 w-9 place-items-center rounded-[10px] text-ink-soft transition-colors duration-150 hover:bg-brand-tint hover:text-brand tablet:hidden"
            >
              <Menu size={20} strokeWidth={2} />
            </button>
            {brand}
          </>
        ) : (
          <Link
            href="/"
            aria-label="Campus Connect map"
            className="flex min-w-0 items-center gap-2 rounded-[10px] tablet:gap-2.5"
          >
            {brand}
          </Link>
        )}
      </div>

      <div className="min-w-0 flex-1 pl-2 pr-3 tablet:pl-6 desktop:pl-8">
        <SearchField {...search} />
      </div>

      <AccountCluster onOpenEvent={search.onSelectResult} />
    </header>
  );
}

function SearchField({ query, onQueryChange, results, onSelectResult }: SearchProps) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const open = focused && query.trim().length > 0;
  const shown = results.slice(0, 6);

  const choose = (event: CampusEvent) => {
    onSelectResult(event);
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === "Escape") {
      onQueryChange("");
    }
  };

  return (
    <div className="relative w-full max-w-[620px]">
      <Search
        size={18}
        strokeWidth={2.2}
        aria-hidden
        className="pointer-events-none absolute left-[17px] top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search events, locations, people, or clubs"
        placeholder="Search events, locations, people, or clubs..."
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className={`h-11 w-full cursor-text rounded-full border border-transparent bg-field pl-[46px] ${query ? "pr-10" : "pr-4"} text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-faint transition-colors duration-150 hover:bg-[#edf0f6] focus:border-brand/30 focus:bg-white focus:outline-none [&::-webkit-search-cancel-button]:hidden`}
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          aria-label="Clear search"
          className="absolute right-[10px] top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:bg-[#e6eaf2] hover:text-ink"
        >
          <X size={14} strokeWidth={2.6} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 right-0 top-[52px] z-50 overflow-hidden rounded-[16px] border border-line bg-panel p-1.5 shadow-float"
          >
            {shown.length === 0 ? (
              <li className="px-3 py-3 text-[14px] font-medium text-muted">
                No events match &ldquo;{query.trim()}&rdquo;.
              </li>
            ) : (
              shown.map((event, index) => (
                <li key={event.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    // Keep focus on the input so blur doesn't close the list first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(event)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex w-full items-center gap-3 rounded-[11px] px-3 py-[9px] text-left transition-colors duration-100 ${
                      index === active ? "bg-brand-tint" : ""
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-field">
                      {event.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={event.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <CategoryGlyph category={event.category} size={17} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-bold text-ink">
                        {event.title}
                      </span>
                      <span className="block truncate text-[12.5px] font-medium text-muted">
                        {event.locationName} · {event.category} · {event.host}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountCluster({ onOpenEvent }: { onOpenEvent: (event: CampusEvent) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 pr-4 tablet:gap-3.5 tablet:pr-[25px]">
      <NotificationCenter onOpenEvent={onOpenEvent} />

      <span aria-hidden className="hidden h-[26px] w-px bg-line-strong tablet:block" />

      <AccountMenu />
    </div>
  );
}
