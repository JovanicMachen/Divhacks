"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, CalendarCheck, CalendarDays, CheckCircle2, Clock, GraduationCap, Link2, MapPin, PenLine, Plus } from "lucide-react";

import { useAccount } from "./AccountProvider";
import { Avatar } from "./Avatar";
import { CategoryGlyph } from "@/components/icons/CategoryIcons";
import { websiteLabel } from "@/lib/account";
import { MARKER_PALETTE } from "@/lib/constants";
import { eventPath } from "@/lib/use-campus-state";
import { useUserEvents } from "@/lib/user-events";
import { cn } from "@/lib/utils";
import type { CampusEvent } from "@/types/event";

const TABS = [
  { id: "posted", label: "Posted", icon: CalendarDays, empty: "You haven't posted any events yet." },
  { id: "attending", label: "Attending", icon: CalendarCheck, empty: "No upcoming events." },
  { id: "saved", label: "Saved", icon: Bookmark, empty: "No saved events yet." },
] as const;

type TabId = (typeof TABS)[number]["id"];

const EMPTY_HINT: Record<TabId, string> = {
  posted: "Events you post on the map show up here.",
  attending: "Tap I'm Going on an event and it'll appear here.",
  saved: "Bookmark an event to keep it here for later.",
};

export function ProfileView() {
  const account = useAccount();
  const { status, mode, displayName, handle, avatarUrl, university, profile, flash, setFlash } = account;
  const { events, myEvents, going, saved, setComposeRequested } = useUserEvents();
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "posted";

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash, setFlash]);

  if (status !== "signedIn") return <ProfileSkeleton />;

  const lists: Record<TabId, CampusEvent[]> = {
    posted: myEvents,
    attending: events.filter((e) => going.has(e.id)),
    saved: events.filter((e) => saved.has(e.id)),
  };
  const stats = [
    { label: "Events Posted", value: myEvents.length },
    { label: "Attended", value: going.size },
    { label: "Saved", value: saved.size },
  ];
  const activeTab = TABS.find((t) => t.id === tab)!;
  const list = lists[tab];

  return (
    <div className="mx-auto w-full max-w-[880px] px-3 pb-12 pt-4 tablet:px-6 tablet:pt-8">
      <AnimatePresence>
        {flash && (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-4 flex items-center gap-2 rounded-[14px] bg-[#DFF3E6] px-4 py-3 text-[14px] font-bold text-[#1F914A]"
          >
            <CheckCircle2 size={18} strokeWidth={2.4} aria-hidden />
            {flash}
          </motion.p>
        )}
      </AnimatePresence>

      <section
        aria-label="Profile"
        className="rounded-[22px] border border-line bg-panel px-5 py-6 shadow-[0_2px_8px_rgb(16_37_71_/_0.04)] tablet:px-8 tablet:py-8"
      >
        <div className="flex flex-col items-center gap-5 text-center tablet:flex-row tablet:items-start tablet:gap-8 tablet:text-left">
          <Avatar src={avatarUrl} name={displayName} size={112} className="ring-4 ring-brand-tint" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-col items-center gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
              <div className="min-w-0">
                <h1 className="break-words text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                  {displayName}
                </h1>
                {handle && <p className="mt-[2px] text-[15px] font-medium text-muted">{handle}</p>}
              </div>
              <Link
                href="/profile/edit"
                className="flex h-10 shrink-0 items-center gap-2 rounded-[12px] bg-field px-4 text-[14px] font-bold text-ink-soft transition-colors hover:bg-[#e6eaf2] hover:text-ink"
              >
                <PenLine size={16} strokeWidth={2.3} aria-hidden />
                Edit Profile
              </Link>
            </div>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[14px] font-semibold text-ink-soft tablet:justify-start">
              <GraduationCap size={17} strokeWidth={2.1} aria-hidden className="text-brand" />
              {university}
            </p>
            {profile?.bio && (
              <p className="mt-2.5 whitespace-pre-line break-words text-[14.5px] leading-[1.5] text-ink-soft">
                {profile.bio}
              </p>
            )}
            {profile?.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-2 inline-flex max-w-full items-center gap-1.5 text-[14px] font-bold text-brand hover:underline"
              >
                <Link2 size={15} strokeWidth={2.4} aria-hidden />
                <span className="truncate">{websiteLabel(profile.website)}</span>
              </a>
            )}
            {!profile?.bio && !profile?.website && (
              <p className="mt-2.5 text-[14px] font-medium text-faint">
                Add a bio and website so people know who&apos;s hosting.{" "}
                <Link href="/profile/edit" className="font-bold text-brand hover:underline">
                  Complete your profile
                </Link>
              </p>
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 divide-x divide-line rounded-[16px] bg-rail py-3.5 ring-1 ring-line">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse items-center gap-[2px] px-2">
              <dt className="text-center text-[12.5px] font-semibold text-muted">{stat.label}</dt>
              <dd className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div role="tablist" aria-label="Your events" className="mt-6 flex border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => {
          const selected = id === tab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={selected}
              aria-controls="profile-tabpanel"
              onClick={() => router.replace(`/profile?tab=${id}`, { scroll: false })}
              className={cn(
                "relative flex h-12 flex-1 items-center justify-center gap-2 text-[14.5px] font-bold transition-colors tablet:flex-none tablet:px-6",
                selected ? "text-brand" : "text-muted hover:text-ink",
              )}
            >
              <Icon size={17} strokeWidth={2.2} aria-hidden />
              {label}
              <span
                className={cn(
                  "rounded-full px-[7px] py-[1px] text-[12px]",
                  selected ? "bg-brand-tint text-brand" : "bg-field text-muted",
                )}
              >
                {lists[id].length}
              </span>
              {selected && (
                <motion.span layoutId="profile-tab" className="absolute inset-x-3 -bottom-px h-[2.5px] rounded-full bg-brand" />
              )}
            </button>
          );
        })}
      </div>

      <div id="profile-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-4">
        {list.length === 0 ? (
          <div className="flex flex-col items-center rounded-[18px] border border-dashed border-line-strong bg-panel px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-tint text-brand">
              <activeTab.icon size={22} strokeWidth={2.2} aria-hidden />
            </span>
            <p className="mt-3 text-[16px] font-bold text-ink">{activeTab.empty}</p>
            <p className="mt-1 max-w-[320px] text-[14px] font-medium text-muted">{EMPTY_HINT[tab]}</p>
            {tab === "posted" ? (
              <button
                type="button"
                onClick={() => {
                  setComposeRequested(true);
                  router.push("/");
                }}
                className="mt-4 flex h-10 items-center gap-1.5 rounded-[12px] bg-brand px-4 text-[14px] font-bold text-white transition-colors hover:bg-brand-dark"
              >
                <Plus size={17} strokeWidth={2.6} aria-hidden />
                Post an Event
              </button>
            ) : (
              <Link
                href="/"
                className="mt-4 flex h-10 items-center rounded-[12px] bg-brand px-4 text-[14px] font-bold text-white transition-colors hover:bg-brand-dark"
              >
                Explore the map
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 tablet:grid-cols-2">
            {list.map((event) => (
              <li key={event.id}>
                <ProfileEventCard event={event} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-center text-[12.5px] font-medium text-faint">
          {mode === "local"
            ? "Local preview: your events, Going and Saved lists are kept in this browser."
            : "Going and Saved are kept in this browser for your account."}
        </p>
      </div>
    </div>
  );
}

function ProfileEventCard({ event }: { event: CampusEvent }) {
  const { setFocusId } = useUserEvents();
  const palette = MARKER_PALETTE[event.markerColor];
  return (
    <Link
      href={eventPath(event)}
      onClick={() => setFocusId(event.id)}
      className="group flex items-center gap-3.5 rounded-[16px] border border-line bg-panel p-3 transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-pill-hover"
    >
      <span
        className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px]"
        style={{ backgroundColor: palette.soft, color: palette.text }}
      >
        <CategoryGlyph category={event.category} size={26} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-bold text-ink group-hover:text-brand">{event.title}</span>
          {event.source === "official" && (
            <span className="shrink-0 rounded-full bg-brand-tint px-2 py-[1px] text-[11px] font-bold text-brand">
              Official
            </span>
          )}
        </span>
        <span className="mt-[3px] flex items-center gap-1.5 text-[13px] font-medium text-muted">
          <Clock size={13} strokeWidth={2.3} aria-hidden className="shrink-0" />
          <span className="truncate">
            {event.dateLabel.split("·")[0].trim()} ·{" "}
            {event.endTime ? `${event.startTime} – ${event.endTime}` : event.startTime}
          </span>
        </span>
        <span className="mt-[2px] flex items-center gap-1.5 text-[13px] font-medium text-muted">
          <MapPin size={13} strokeWidth={2.3} aria-hidden className="shrink-0" />
          <span className="truncate">{event.locationName}</span>
        </span>
      </span>
      <span
        className="hidden shrink-0 self-start rounded-full px-2.5 py-[3px] text-[11.5px] font-bold desktop:block"
        style={{ backgroundColor: palette.soft, color: palette.text }}
      >
        {event.category}
      </span>
    </Link>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy className="mx-auto w-full max-w-[880px] px-3 pt-4 tablet:px-6 tablet:pt-8">
      <div className="flex animate-pulse flex-col items-center gap-5 rounded-[22px] border border-line bg-panel px-5 py-8 tablet:flex-row tablet:px-8">
        <span className="h-28 w-28 rounded-full bg-field" />
        <span className="flex w-full flex-1 flex-col items-center gap-3 tablet:items-start">
          <span className="h-6 w-48 rounded bg-field" />
          <span className="h-4 w-32 rounded bg-field" />
          <span className="h-4 w-60 rounded bg-field" />
        </span>
      </div>
    </div>
  );
}
