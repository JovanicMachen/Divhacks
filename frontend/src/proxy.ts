import { NextResponse, type NextRequest } from "next/server";

import { isRoutableEventId } from "@/lib/event-ids";

/**
 * `/events/[id]` accepts on-demand ids, so a `notFound()` in the page would stream as a soft 404
 * with status 200. Rejecting unknown ids here, before rendering, keeps a real 404 status.
 */
export function proxy(request: NextRequest) {
  const id = decodeURIComponent(request.nextUrl.pathname.slice("/events/".length));
  if (isRoutableEventId(id)) return NextResponse.next();
  return NextResponse.rewrite(new URL("/_event-not-found", request.url));
}

export const config = {
  matcher: "/events/:id",
};
