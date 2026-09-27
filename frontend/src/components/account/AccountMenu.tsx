"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  CalendarDays,
  ChevronDown,
  LogOut,
  PenLine,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { useAccount } from "./AccountProvider";
import { Avatar } from "./Avatar";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const MENU_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/profile/edit", label: "Edit Profile", icon: PenLine },
  { href: "/profile?tab=posted", label: "My Events", icon: CalendarDays },
  { href: "/profile?tab=saved", label: "Saved Events", icon: Bookmark },
];

const ITEM =
  "flex h-11 w-full items-center gap-3 rounded-[11px] px-3 text-left text-[14.5px] font-semibold text-ink-soft outline-none transition-colors duration-100 hover:bg-[#f5f7fb] hover:text-ink focus-visible:bg-brand-tint focus-visible:text-ink focus-visible:outline-none";

/**
 * Top-right account control. Signed in, it opens a quick account menu
 * (a bottom sheet on phones); signed out, it opens the sign-in dialog.
 */
export function AccountMenu() {
  const account = useAccount();
  const { status, displayName, avatarUrl, university, openAuth } = account;
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isSheet = useMediaQuery("(max-width: 899px)");
  const signedIn = status === "signedIn";

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const onTrigger = () => {
    if (status === "loading") return;
    if (!signedIn) {
      openAuth("signIn");
      return;
    }
    setOpen((o) => !o);
  };

  const name = signedIn ? displayName : status === "loading" ? "" : "Sign In";
  const subtitle = signedIn ? university : status === "loading" ? "" : "Campus Connect";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onTrigger}
        aria-haspopup={signedIn ? "menu" : "dialog"}
        aria-expanded={signedIn ? open : undefined}
        aria-controls={open ? menuId : undefined}
        aria-label={signedIn ? `Account menu for ${displayName}` : "Sign in to Campus Connect"}
        aria-busy={status === "loading"}
        className={cn(
          "flex cursor-pointer items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors duration-150 hover:bg-[#f5f7fb] tablet:pr-2",
          open && "bg-[#f5f7fb]",
        )}
      >
        <Avatar src={signedIn ? avatarUrl : null} name={signedIn ? displayName : null} size={41} />
        <span className="hidden min-w-[92px] max-w-[180px] text-left leading-none desktop:block">
          <span className="block truncate text-[15px] font-bold text-ink">
            {name || <span className="block h-[14px] w-[88px] animate-pulse rounded bg-field" />}
          </span>
          <span className="mt-[3px] block truncate text-[12.5px] font-medium text-muted">
            {subtitle || <span className="mt-[5px] block h-[10px] w-[112px] animate-pulse rounded bg-field" />}
          </span>
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2.2}
          aria-hidden
          className={cn("hidden text-faint transition-transform duration-150 desktop:block", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && signedIn && (
          <>
            {isSheet && (
              <motion.div
                key="backdrop"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 bg-ink/30"
              />
            )}
            <motion.div
              key="menu"
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="Account"
              onKeyDown={onMenuKeyDown}
              initial={isSheet ? { y: "100%" } : { opacity: 0, y: -6, scale: 0.98 }}
              animate={isSheet ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={isSheet ? { y: "100%" } : { opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: isSheet ? 0.26 : 0.16, ease: [0.32, 0.72, 0, 1] }}
              className={cn(
                "bg-panel p-2",
                isSheet
                  ? "fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[22px] pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,37,71,0.18)] scrollbar-none"
                  : "absolute right-0 top-[calc(100%+10px)] w-[332px] origin-top-right rounded-[18px] border border-line shadow-float",
              )}
            >
              {isSheet && <span aria-hidden className="mx-auto mb-2 mt-1 block h-1 w-10 rounded-full bg-line-strong" />}
              <AccountSummary onNavigate={() => close()} />
              <Divider />
              {MENU_LINKS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} role="menuitem" onClick={() => close()} className={ITEM}>
                  <Icon size={19} strokeWidth={2.1} aria-hidden className="text-muted" />
                  {label}
                </Link>
              ))}
              <Divider />
              <Link href="/settings" role="menuitem" onClick={() => close()} className={ITEM}>
                <Settings size={19} strokeWidth={2.1} aria-hidden className="text-muted" />
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  close();
                  await account.signOut();
                }}
                className={ITEM}
              >
                <LogOut size={19} strokeWidth={2.1} aria-hidden className="text-muted" />
                Sign Out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Divider() {
  return <div role="separator" className="mx-2 my-1.5 h-px bg-line" />;
}

function AccountSummary({ onNavigate }: { onNavigate: () => void }) {
  const { displayName, handle, avatarUrl, university } = useAccount();
  return (
    <div className="px-2.5 pb-3 pt-2.5">
      <div className="flex items-center gap-3.5">
        <Avatar src={avatarUrl} name={displayName} size={56} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-extrabold tracking-[-0.01em] text-ink">{displayName}</p>
          {handle && <p className="truncate text-[13.5px] font-medium text-muted">{handle}</p>}
          <p className="mt-[2px] truncate text-[12.5px] font-medium text-faint">{university}</p>
        </div>
      </div>
      <Link
        href="/profile"
        role="menuitem"
        onClick={onNavigate}
        className="mt-3.5 flex h-10 w-full items-center justify-center rounded-[12px] bg-brand-soft text-[14px] font-bold text-brand outline-none transition-colors duration-150 hover:bg-[#dde8fa] focus-visible:ring-4 focus-visible:ring-brand/20"
      >
        View Profile
      </Link>
    </div>
  );
}
