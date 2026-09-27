"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { TopNavbar } from "./TopNavbar";
import { isOffLiveMap, useLifecycleNow } from "@/lib/event-clock";
import { eventPath } from "@/lib/use-campus-state";
import { useUserEvents } from "@/lib/user-events";

/** Header plus a scrolling content column, for pages away from the map. */
export function PageShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { events, setFocusId } = useUserEvents();
  const [query, setQuery] = useState("");
  const lifecycleNow = useLifecycleNow(events);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return events.filter(
      (e) =>
        !isOffLiveMap(e, lifecycleNow) &&
        [e.title, e.category, e.locationName, e.host].some((field) => field.toLowerCase().includes(q)),
    );
  }, [events, query, lifecycleNow]);

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-canvas">
      <TopNavbar
        query={query}
        onQueryChange={setQuery}
        results={results}
        onSelectResult={(event) => {
          setFocusId(event.id);
          router.push(eventPath(event) ?? "/");
        }}
      />
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
